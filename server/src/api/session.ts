/**
 * Training-session lifecycle (Phase 12/13).
 *
 *   POST /api/session                    → get-or-create the caller's active session
 *   GET  /api/session/partner-candidates → other privileged accounts, excluding self
 *   GET  /api/session/current            → active session for a scope, or { session: null }
 *   POST /api/session/:id/end            → end (participant-only)
 *   GET  /api/session/:id/live-order     → session-scoped live order
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { Db } from '../db.js'
import type { Privilege } from '../auth.js'
import {
  getOrCreateActiveSession,
  getActiveSessionForScope,
  getSessionSnapshot,
  liveOrderForSession,
  isParticipant,
  endSession,
} from '../sessions.js'
import { authedUser, getUserId } from './helpers.js'

export function registerSessionRoutes(app: FastifyInstance, db: Db): void {

  // Resolve a partner username → its user id, but only if privileged (user/admin).
  function resolvePartner(partnerUsername: string): { id: number } | { error: string; code: number } {
    const row = db.prepare(`
      SELECT u.id AS id, COALESCE(p.level, 'user') AS level
      FROM users u LEFT JOIN user_privilege p ON p.user_id = u.id
      WHERE u.cwa_username = ?
    `).get(partnerUsername) as { id: number; level: Privilege } | undefined
    if (!row) return { error: `Unknown partner account: ${partnerUsername}`, code: 404 }
    if (row.level !== 'user' && row.level !== 'admin') {
      return { error: `${partnerUsername} is not enabled to train (level: ${row.level})`, code: 403 }
    }
    return { id: row.id }
  }

  // POST /api/session — get-or-create the caller's active session for a (date, workout)
  app.post<{ Body: { scopeDate: string; workout: string; mode?: 'solo' | 'shared'; partnerUsername?: string } }>(
    '/api/session',
    async (req: FastifyRequest<{ Body: { scopeDate: string; workout: string; mode?: 'solo' | 'shared'; partnerUsername?: string } }>, reply: FastifyReply) => {
      const { username, level } = authedUser(req)
      // Read-only invariant: viewers may observe but never create/mutate a session.
      if (level === 'viewer') {
        return reply.code(403).send({ error: 'Viewers cannot start a session' })
      }
      const userId = getUserId(db, username)
      const { scopeDate, workout, mode, partnerUsername } = req.body ?? {}
      if (!scopeDate || !workout) {
        return reply.code(400).send({ error: 'scopeDate and workout are required' })
      }
      let partnerId: number | null = null
      if (partnerUsername && partnerUsername !== username) {
        const resolved = resolvePartner(partnerUsername)
        if ('error' in resolved) return reply.code(resolved.code).send({ error: resolved.error })
        partnerId = resolved.id
      }
      const snapshot = getOrCreateActiveSession(db, userId, { scopeDate, workout, mode, partnerId })
      return reply.send(snapshot)
    },
  )

  // GET /api/session/partner-candidates → other privileged accounts (user/admin), excluding self.
  // Two users → at most one candidate; empty means "train alone, no prompt".
  app.get('/api/session/partner-candidates', async (req: FastifyRequest, reply: FastifyReply) => {
    const { username } = authedUser(req)
    const rows = db.prepare(`
      SELECT u.cwa_username AS username, COALESCE(p.level, 'user') AS level
      FROM users u
      LEFT JOIN user_privilege p ON p.user_id = u.id
      WHERE u.cwa_username != ? AND COALESCE(p.level, 'user') IN ('user', 'admin')
      ORDER BY u.created_at ASC
    `).all(username) as { username: string; level: Privilege }[]
    return reply.send({ candidates: rows })
  })

  // GET /api/session/current?scopeDate=&workout= → current active session or { session: null }
  app.get('/api/session/current', async (req: FastifyRequest, reply: FastifyReply) => {
    const { username, level } = authedUser(req)
    // Viewers never participate in sessions — report none rather than leaking one.
    if (level === 'viewer') return reply.send({ session: null })
    const userId = getUserId(db, username)
    const { scopeDate, workout } = req.query as { scopeDate?: string; workout?: string }
    if (!scopeDate || !workout) {
      return reply.code(400).send({ error: 'scopeDate and workout are required' })
    }
    const session = getActiveSessionForScope(db, userId, scopeDate, workout)
    if (!session) return reply.send({ session: null })
    return reply.send(getSessionSnapshot(db, session.id))
  })

  // POST /api/session/:id/end — end a session (only a participant may end it)
  app.post<{ Params: { id: string } }>(
    '/api/session/:id/end',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { username } = authedUser(req)
      const userId = getUserId(db, username)
      const id = Number(req.params.id)
      const ok = endSession(db, id, userId)
      if (!ok) return reply.code(403).send({ error: 'Cannot end this session' })
      return reply.send({ ok: true })
    },
  )

  // GET /api/session/:id/live-order — session-scoped live order (replaces /api/live-order)
  app.get<{ Params: { id: string } }>(
    '/api/session/:id/live-order',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { username } = authedUser(req)
      const userId = getUserId(db, username)
      const id = Number(req.params.id)
      if (!isParticipant(db, id, userId)) {
        return reply.code(403).send({ error: 'Not a participant of this session' })
      }
      const live = liveOrderForSession(db, id)
      if (!live) return reply.code(404).send({ error: 'No such session' })
      return reply.send(live)
    },
  )
}
