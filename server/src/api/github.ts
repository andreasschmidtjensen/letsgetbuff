/**
 * GitHub bug reporting — device-flow connect + issue creation.
 *
 *   GET    /api/github/status        → { configured, connected, githubLogin }
 *   POST   /api/github/device/start  → begin device flow (userCode + link)
 *   POST   /api/github/device/poll   → exchange deviceCode; stores token when granted
 *   DELETE /api/github/token         → disconnect (delete stored token)
 *   POST   /api/github/issue         → create a GitHub issue as the caller
 *
 * All routes sit behind the global authGuard (any logged-in user, viewer+).
 * The deviceCode is deliberately client-echoed rather than held server-side:
 * the flow stays stateless, and a poll can only ever bind the resulting token
 * to the poller's own authenticated account.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { Db } from '../db.js'
import { authedUser } from './helpers.js'
import { APP_VERSION } from '../version.js'
import {
  MISSING_CLIENT_ID_MESSAGE,
  getGithubClientId, isGithubConfigured,
  getToken, saveToken, deleteToken,
  startDeviceFlow, pollDeviceFlow, mapPollResponse,
  fetchGithubLogin, buildIssueBody, createIssue, GithubApiError,
} from '../github.js'

export function registerGithubRoutes(app: FastifyInstance, db: Db): void {

  // ── GET /api/github/status ──────────────────────────────────────────────────
  app.get('/api/github/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const row = getToken(db, authedUser(req).sub)
    return reply.send({
      configured: isGithubConfigured(db),
      connected: Boolean(row),
      githubLogin: row?.github_login ?? null,
    })
  })

  // ── POST /api/github/device/start ───────────────────────────────────────────
  app.post('/api/github/device/start', async (_req: FastifyRequest, reply: FastifyReply) => {
    const clientId = getGithubClientId(db)
    if (!clientId) {
      return reply.code(503).send({ error: MISSING_CLIENT_ID_MESSAGE, configured: false })
    }
    try {
      const flow = await startDeviceFlow(clientId)
      return reply.send({
        userCode: flow.user_code,
        verificationUri: flow.verification_uri,
        deviceCode: flow.device_code,
        expiresIn: flow.expires_in,
        interval: flow.interval,
      })
    } catch (err) {
      app.log.error({ err }, '[api] GitHub device-flow start failed')
      return reply.code(502).send({ error: String(err) })
    }
  })

  // ── POST /api/github/device/poll ────────────────────────────────────────────
  app.post<{ Body: { deviceCode: string } }>(
    '/api/github/device/poll',
    {
      schema: {
        body: {
          type: 'object',
          required: ['deviceCode'],
          properties: { deviceCode: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (req: FastifyRequest<{ Body: { deviceCode: string } }>, reply: FastifyReply) => {
      const clientId = getGithubClientId(db)
      if (!clientId) {
        return reply.code(503).send({ error: MISSING_CLIENT_ID_MESSAGE, configured: false })
      }
      try {
        const result = mapPollResponse(await pollDeviceFlow(clientId, req.body.deviceCode))
        if (result.status !== 'connected') return reply.send(result)
        // Granted: fetch the login for display, but never lose the token if
        // that lookup fails — store with a null login instead.
        let githubLogin: string | null = null
        try {
          githubLogin = await fetchGithubLogin(result.token)
        } catch (err) {
          app.log.warn({ err }, '[api] GitHub GET /user failed after device grant')
        }
        saveToken(db, authedUser(req).sub, result.token, githubLogin)
        return reply.send({ status: 'connected', githubLogin })
      } catch (err) {
        app.log.error({ err }, '[api] GitHub device-flow poll failed')
        return reply.code(502).send({ error: String(err) })
      }
    },
  )

  // ── DELETE /api/github/token ────────────────────────────────────────────────
  app.delete('/api/github/token', async (req: FastifyRequest, reply: FastifyReply) => {
    deleteToken(db, authedUser(req).sub)
    return reply.send({ ok: true })
  })

  // ── POST /api/github/issue ──────────────────────────────────────────────────
  app.post<{ Body: { title: string; description?: string } }>(
    '/api/github/issue',
    {
      schema: {
        body: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 256 },
            description: { type: 'string', maxLength: 10000 },
          },
        },
      },
    },
    async (req: FastifyRequest<{ Body: { title: string; description?: string } }>, reply: FastifyReply) => {
      const user = authedUser(req)
      const title = req.body.title.trim()
      if (!title) return reply.code(400).send({ error: 'title is required' })
      const row = getToken(db, user.sub)
      if (!row) return reply.code(409).send({ error: 'GitHub account not connected' })
      const body = buildIssueBody(req.body.description ?? '', {
        username: user.username,
        githubLogin: row.github_login,
        appVersion: APP_VERSION,
        userAgent: req.headers['user-agent'] ?? 'unknown',
      })
      try {
        const issue = await createIssue(row.token, title, body)
        return reply.code(201).send({ ok: true, url: issue.url, number: issue.number })
      } catch (err) {
        if (err instanceof GithubApiError && err.statusCode === 401) {
          // Token revoked at GitHub — drop it so the UI flips back to Connect.
          deleteToken(db, user.sub)
          return reply.code(401).send({
            error: 'GitHub authorization revoked — reconnect in Settings',
            reconnect: true,
          })
        }
        app.log.error({ err }, '[api] GitHub issue creation failed')
        return reply.code(502).send({ error: String(err) })
      }
    },
  )
}
