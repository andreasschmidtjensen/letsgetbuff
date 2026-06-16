import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import staticPlugin from '@fastify/static'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from './config.js'
import { openDb } from './db.js'
import { loginHandler, logoutHandler, meHandler, authGuard, closeCwaDb } from './auth.js'
import { registerApiRoutes } from './api.js'
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

  app.addHook('preHandler', authGuard.bind(app))

  app.post<{ Body: { username: string; password: string } }>(
    '/api/login',
    { schema: { body: { type: 'object', required: ['username', 'password'], properties: { username: { type: 'string' }, password: { type: 'string' } } } } },
    (req: any, reply: any) => loginHandler.call(app, req, reply, db),
  )
  app.post('/api/logout', (req: any, reply: any) => logoutHandler(req, reply))
  app.get('/api/me', (req: any, reply: any) => meHandler(req, reply))

  registerApiRoutes(app, db)

  app.get('/api/live-order', async (_req: any, reply: any) => {
    const row = db.prepare(
      'SELECT exercise_order_json, version, scope_date, scope_workout FROM live_order WHERE id = 1'
    ).get() as { exercise_order_json: string; version: number; scope_date: string | null; scope_workout: string | null } | undefined
    if (!row) return reply.code(404).send({ error: 'No live order' })
    return reply.send({
      order: JSON.parse(row.exercise_order_json) as string[],
      version: row.version,
      scopeDate: row.scope_date,
      scopeWorkout: row.scope_workout,
    })
  })

  app.get('/api/health', async () => ({ ok: true, version: 10 }))

  if (!config.isDev) {
    const staticDir = path.isAbsolute(config.staticDir)
      ? config.staticDir
      : path.resolve(__dirname, '../../', config.staticDir)
    await app.register(staticPlugin, { root: staticDir, prefix: '/' })
    app.setNotFoundHandler((_req: any, reply: any) => { reply.sendFile('index.html') })
  }

  await app.listen({ port: config.port, host: '0.0.0.0' })
  console.log('[server] Listening on port', config.port)

  app.server.on('upgrade', (req: import('http').IncomingMessage, socket: import('net').Socket, head: Buffer) => {
    if (req.url !== '/ws') { socket.destroy(); return }
    const payload = authenticateUpgrade(req, (code, msg) => {
      socket.write('HTTP/1.1 ' + code + ' ' + msg + '\r\n\r\n')
      socket.destroy()
    })
    if (!payload) return
    wss.handleUpgrade(req, socket, head, (ws) => {
      ;(ws as AuthedClient).username = payload.username
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
