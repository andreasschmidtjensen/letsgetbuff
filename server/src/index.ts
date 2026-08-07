import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import staticPlugin from '@fastify/static'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from './config.js'
import { openDb } from './db.js'
import { loginHandler, logoutHandler, meHandler, authGuard, liveLevel, closeCwaDb } from './auth.js'
import { registerApiRoutes } from './api.js'
import { APP_VERSION, GIT_SHA, SHORT_SHA } from './version.js'
import { createWsServer, authenticateUpgrade, AuthedClient } from './ws.js'
import { startBackupScheduler } from './backup.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function start() {
  // Log AI key presence only (never the value) so deploys can confirm config.
  console.log('[claude] API key present:', Boolean(config.anthropicApiKey))
  const db = openDb()
  const stopBackup = startBackupScheduler(config.buffDbPath)
  const wss = createWsServer(db)

  const app = Fastify({
    logger: config.isDev ? { transport: { target: 'pino-pretty' } } : true,
  })

  await app.register(cookie)
  await app.register(jwt, {
    secret: config.sessionSecret,
    cookie: { cookieName: 'session', signed: false },
  })

  // authGuard reads this to refresh the caller's privilege from the DB on
  // every request (JWT level is only a fallback).
  app.decorate('buffDb', db)
  app.addHook('preHandler', authGuard.bind(app))

  app.post<{ Body: { username: string; password: string } }>(
    '/api/login',
    { schema: { body: { type: 'object', required: ['username', 'password'], properties: { username: { type: 'string' }, password: { type: 'string' } } } } },
    (req: any, reply: any) => loginHandler.call(app, req, reply, db),
  )
  app.post('/api/logout', (req: any, reply: any) => logoutHandler(req, reply))
  app.get('/api/me', (req: any, reply: any) => meHandler(req, reply))

  registerApiRoutes(app, db)

  // Live order is now session-scoped — see GET /api/session/:id/live-order (api.ts).

  // `sha` is what the client compares against its own baked-in build sha to
  // detect a stale service-worker cache; `version` stays for the deploy check.
  app.get('/api/health', async () => ({
    ok: true, version: APP_VERSION, sha: GIT_SHA, shortSha: SHORT_SHA,
  }))

  if (!config.isDev) {
    const staticDir = path.isAbsolute(config.staticDir)
      ? config.staticDir
      : path.resolve(__dirname, '../../', config.staticDir)
    await app.register(staticPlugin, { root: staticDir, prefix: '/' })
    app.setNotFoundHandler((_req: any, reply: any) => { reply.sendFile('index.html') })
  }

  await app.listen({ port: config.port, host: '0.0.0.0' })
  console.log('[server] Listening on port', config.port)

  // Cross-site WebSocket hijack guard: a browser always sends Origin on WS
  // upgrades. Same host as the request (any port) is fine; anything else must
  // be allowlisted via WS_ALLOWED_ORIGINS. Non-browser clients without an
  // Origin header pass — they can't ride a victim's cookie.
  const wsOriginAllowed = (req: import('http').IncomingMessage): boolean => {
    const origin = req.headers.origin
    if (!origin) return true
    try {
      const originHost = new URL(origin).hostname
      const reqHost = (req.headers.host ?? '').split(':')[0]
      if (originHost === reqHost && originHost !== '') return true
    } catch { /* malformed Origin → fall through to allowlist */ }
    return config.wsAllowedOrigins.includes(origin)
  }

  app.server.on('upgrade', (req: import('http').IncomingMessage, socket: import('net').Socket, head: Buffer) => {
    const url = new URL(req.url ?? '', 'http://localhost')
    if (url.pathname !== '/ws') { socket.destroy(); return }
    if (!wsOriginAllowed(req)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return
    }
    const sessionId = Number(url.searchParams.get('sessionId'))
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
      socket.destroy()
      return
    }
    const payload = authenticateUpgrade(req, (t) => app.jwt.verify(t), (code, msg) => {
      socket.write('HTTP/1.1 ' + code + ' ' + msg + '\r\n\r\n')
      socket.destroy()
    })
    if (!payload) return
    // Privilege is re-read from the DB per connection, not trusted from the JWT.
    const level = liveLevel(db, payload.sub, payload.level)
    if (level === 'none') {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const client = ws as AuthedClient
      client.username = payload.username
      client.userId = payload.sub
      client.sessionId = sessionId
      client.level = level
      wss.emit('connection', ws, req)
    })
  })

  const shutdown = async () => {
    stopBackup()
    wss.close()
    await app.close()
    db.close()
    closeCwaDb()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

start().catch((err) => {
  console.error('[server] Fatal:', err)
  process.exit(1)
})
