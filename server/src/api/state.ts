/**
 * Per-user AppState sync (Phase 4) + the cross-user state paths that ride on
 * it: partner history overlay (Phase 17) and proxy input (Phase 16).
 *
 *   GET  /api/state            → caller's AppState
 *   PUT  /api/state            → upsert; last-write-wins
 *   GET  /api/partner-history  → partner's sessions blob for chart overlay
 *   PUT  /api/proxy-log        → write an exercise entry into the partner's state
 *                                (caller must be in an active shared session)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { EMPTY_STATE, SCHEMA_VERSION, upgrade } from '@letsgetbuff/shared'
import type { AppState, Session, ExerciseEntry } from '@letsgetbuff/shared'
import type { Db } from '../db.js'
import { isParticipant, getParticipants } from '../sessions.js'
import { authedUser, getUserId } from './helpers.js'

export function registerStateRoutes(app: FastifyInstance, db: Db): void {

  // ── GET /api/state ─────────────────────────────────────────────────────────
  app.get('/api/state', async (req: FastifyRequest, reply: FastifyReply) => {
    const { username } = authedUser(req)
    const userId = getUserId(db, username)
    const row = db
      .prepare('SELECT json, updated_at FROM app_state WHERE user_id = ?')
      .get(userId) as { json: string; updated_at: string } | undefined
    if (!row) {
      return reply.send({ state: { ...EMPTY_STATE }, updatedAt: null })
    }
    try {
      // Migrate the stored blob through the shared ladder before serving it — a
      // pre-v3 server state lacks stretchSessions/stretchSchedule and would crash
      // views that read them. Same steps the client runs on its cache.
      const parsed: unknown = JSON.parse(row.json)
      const state = upgrade(parsed) ?? (parsed as AppState)
      return reply.send({ state, updatedAt: row.updated_at })
    } catch {
      app.log.error(`[api] Corrupt app_state JSON for user ${username}`)
      return reply.send({ state: { ...EMPTY_STATE }, updatedAt: null })
    }
  })

  // ── PUT /api/state ─────────────────────────────────────────────────────────
  app.put<{ Body: { state: AppState } }>(
    '/api/state',
    {
      schema: {
        body: {
          type: 'object',
          required: ['state'],
          properties: { state: { type: 'object', additionalProperties: true } },
        },
      },
    },
    async (req: FastifyRequest<{ Body: { state: AppState } }>, reply: FastifyReply) => {
      const { username, level } = authedUser(req)
      // viewer is read-only — they may GET state but never write it.
      if (level === 'viewer') {
        return reply.code(403).send({ error: 'Viewers cannot modify workout data' })
      }
      const userId = getUserId(db, username)
      const { state: raw } = req.body
      // Run the incoming blob through the shared ladder and reject anything whose
      // upgraded shape isn't a plausible AppState — never store an unvalidated
      // client-claimed blob verbatim. What we persist is always canonical/current.
      const state = upgrade(raw)
      if (!state) {
        return reply.code(400).send({ error: 'Invalid state payload' })
      }
      const now = new Date().toISOString()
      db.prepare(`
        INSERT INTO app_state (user_id, json, schema_version, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (user_id) DO UPDATE SET
          json = excluded.json,
          schema_version = excluded.schema_version,
          updated_at = excluded.updated_at
      `).run(userId, JSON.stringify(state), state.schemaVersion ?? SCHEMA_VERSION, now)
      return reply.send({ ok: true, updatedAt: now })
    },
  )

  // ── Phase 17: Partner history (chart overlay) ───────────────────────────────
  //
  // GET /api/partner-history
  //   Returns the other user's sessions blob so the client can overlay their
  //   lift data on the History charts.  Only sessions are shared (no metrics or
  //   milestones).  "Partner" = the other privileged (user/admin) account.
  //
  app.get('/api/partner-history', async (req: FastifyRequest, reply: FastifyReply) => {
    const { username } = authedUser(req)
    const partnerRow = db.prepare(`
      SELECT u.cwa_username AS username, u.id AS id
      FROM users u
      LEFT JOIN user_privilege p ON p.user_id = u.id
      WHERE u.cwa_username != ?
        AND COALESCE(p.level, 'user') IN ('user', 'admin')
      ORDER BY u.created_at ASC
      LIMIT 1
    `).get(username) as { username: string; id: number } | undefined

    if (!partnerRow) return reply.send({ partnerUsername: null, sessions: {} })

    const stateRow = db
      .prepare('SELECT json FROM app_state WHERE user_id = ?')
      .get(partnerRow.id) as { json: string } | undefined

    if (!stateRow) return reply.send({ partnerUsername: partnerRow.username, sessions: {} })

    try {
      const parsed: unknown = JSON.parse(stateRow.json)
      const state = upgrade(parsed) ?? (parsed as AppState)
      return reply.send({ partnerUsername: partnerRow.username, sessions: state.sessions ?? {} })
    } catch {
      return reply.send({ partnerUsername: partnerRow.username, sessions: {} })
    }
  })

  // ── Phase 16: Proxy input ────────────────────────────────────────────────────
  //
  // PUT /api/proxy-log
  //   Writes a single exercise entry into the partner's app_state. The caller
  //   must be a participant in an active shared session; the partner is the
  //   other participant. Viewers are blocked (403).
  //
  //   Body: { sessionId, date, exerciseId, workout, entry: { sets, feltEasy } }
  //
  app.put<{
    Body: {
      sessionId: number
      date: string
      exerciseId: string
      workout: string
      entry: { sets: unknown[]; feltEasy: boolean }
    }
  }>(
    '/api/proxy-log',
    {
      schema: {
        body: {
          type: 'object',
          required: ['sessionId', 'date', 'exerciseId', 'workout', 'entry'],
          properties: {
            sessionId:   { type: 'number' },
            date:        { type: 'string' },
            exerciseId:  { type: 'string' },
            workout:     { type: 'string' },
            entry:       { type: 'object', additionalProperties: true },
          },
        },
      },
    },
    async (req: FastifyRequest<{ Body: { sessionId: number; date: string; exerciseId: string; workout: string; entry: { sets: unknown[]; feltEasy: boolean } } }>, reply: FastifyReply) => {
      const { username, level } = authedUser(req)
      if (level === 'viewer') return reply.code(403).send({ error: 'Viewers cannot log data' })

      const userId = getUserId(db, username)
      const { sessionId, date, exerciseId, workout, entry } = req.body

      // Caller must be a participant.
      if (!isParticipant(db, sessionId, userId)) {
        return reply.code(403).send({ error: 'Not a participant of this session' })
      }

      // Find the partner (the other participant).
      const participants = getParticipants(db, sessionId)
      const partner = participants.find(p => p.username !== username)
      if (!partner) {
        return reply.code(400).send({ error: 'No partner in this session — proxy log requires a shared session' })
      }

      // Resolve partner's user id.
      const partnerRow = db
        .prepare('SELECT id FROM users WHERE cwa_username = ?')
        .get(partner.username) as { id: number } | undefined
      if (!partnerRow) return reply.code(404).send({ error: 'Partner user record not found' })

      // Load partner's current state (or start from EMPTY_STATE).
      const stateRow = db
        .prepare('SELECT json FROM app_state WHERE user_id = ?')
        .get(partnerRow.id) as { json: string } | undefined
      // Migrate the partner's stored blob before merging — writing into an
      // unmigrated pre-v3 state would persist a shape the client later can't read.
      const partnerState: AppState = stateRow
        ? (upgrade(JSON.parse(stateRow.json)) ?? { ...EMPTY_STATE })
        : { ...EMPTY_STATE }

      // Merge the exercise entry. Ensure the session row exists.
      if (!partnerState.sessions[date]) {
        partnerState.sessions[date] = {
          workout: workout as Session['workout'],
          done: false,
          entries: {},
        }
      }
      partnerState.sessions[date].entries[exerciseId] = entry as ExerciseEntry

      // Persist.
      const now = new Date().toISOString()
      db.prepare(`
        INSERT INTO app_state (user_id, json, schema_version, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (user_id) DO UPDATE SET
          json = excluded.json,
          schema_version = excluded.schema_version,
          updated_at = excluded.updated_at
      `).run(partnerRow.id, JSON.stringify(partnerState), partnerState.schemaVersion ?? SCHEMA_VERSION, now)

      return reply.send({ ok: true, partner: partner.username, updatedAt: now })
    },
  )
}
