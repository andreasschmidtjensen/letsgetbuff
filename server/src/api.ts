/**
 * REST API routes.
 *
 * Phase 4: per-user AppState sync
 *   GET  /api/state                → caller's AppState
 *   PUT  /api/state                → upsert; last-write-wins
 *
 * Phase 8: plan management + Claude exercise discovery
 *   GET  /api/plan                 → current shared plan
 *   GET  /api/plan/proposals       → pending proposals
 *   POST /api/plan/propose         → ask Claude for a new exercise (stores as pending)
 *   POST /api/plan/approve/:id     → validate + append to plan (bumps version)
 *   POST /api/plan/reject/:id      → mark proposal rejected
 *
 * Phase 16: proxy input
 *   PUT  /api/proxy-log            → write an exercise entry into the partner's state
 *                                    (caller must be in an active shared session)
 *
 * Phase 17: history charts
 *   GET  /api/partner-history      → partner's sessions blob for chart overlay
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { EMPTY_STATE, SCHEMA_VERSION } from '@letsgetbuff/shared'
import type { AppState, Plan, Session, ExerciseEntry, ExerciseDef } from '@letsgetbuff/shared'
import type { Db } from './db.js'
import { proposeExercise, validateExerciseDef, isAiConfigured, getApiKey, MISSING_KEY_MESSAGE } from './claude.js'
import { requirePrivilege, type Privilege } from './auth.js'
import {
  getOrCreateActiveSession,
  getActiveSessionForScope,
  getSessionSnapshot,
  liveOrderForSession,
  isParticipant,
  getParticipants,
  endSession,
} from './sessions.js'

// Shape attached by authGuard (Phase 3; level added Phase 11)
interface JwtUser {
  sub: number
  username: string
  level?: Privilege
}

function authedUser(req: FastifyRequest): JwtUser {
  return (req as FastifyRequest & { user: JwtUser }).user
}

// Row shape for plan_proposals table
interface PlanProposalRow {
  id: number
  workout_id: 'A' | 'B'
  request: string
  json: string
  status: 'pending' | 'approved' | 'rejected'
  proposed_at: string
  reviewed_at: string | null
}

// Look up (or fail fast on) a user row — users are created lazily at login
function getUserId(db: Db, username: string): number {
  const row = db
    .prepare('SELECT id FROM users WHERE cwa_username = ?')
    .get(username) as { id: number } | undefined
  if (!row) throw new Error(`User not found in buff.db: ${username}`)
  return row.id
}

export function registerApiRoutes(app: FastifyInstance, db: Db): void {

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
      const state = JSON.parse(row.json) as AppState
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
      const { state } = req.body
      if (typeof state !== 'object' || state === null) {
        return reply.code(400).send({ error: 'Invalid state payload' })
      }
      const now = new Date().toISOString()
      const schemaVersion =
        typeof state.schemaVersion === 'number' ? state.schemaVersion : SCHEMA_VERSION
      db.prepare(`
        INSERT INTO app_state (user_id, json, schema_version, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (user_id) DO UPDATE SET
          json = excluded.json,
          schema_version = excluded.schema_version,
          updated_at = excluded.updated_at
      `).run(userId, JSON.stringify(state), schemaVersion, now)
      return reply.send({ ok: true, updatedAt: now })
    },
  )

  // ── GET /api/plan ───────────────────────────────────────────────────────────
  app.get('/api/plan', async (_req: FastifyRequest, reply: FastifyReply) => {
    const row = db.prepare('SELECT json, version FROM plan WHERE id = 1').get() as
      | { json: string; version: number }
      | undefined
    if (!row) return reply.code(404).send({ error: 'Plan not found' })
    const plan = JSON.parse(row.json) as Plan
    return reply.send({ plan, version: row.version })
  })

  // ── GET /api/plan/ai-status ─────────────────────────────────────────────────
  // Reports whether the server has an Anthropic key configured. No key value,
  // no network call. Lets the UI distinguish "not configured" from "call failed".
  app.get('/api/plan/ai-status', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ configured: isAiConfigured(db) })
  })

  // ── GET /api/plan/proposals ─────────────────────────────────────────────────
  app.get('/api/plan/proposals', async (req: FastifyRequest, reply: FastifyReply) => {
    const { status } = req.query as { status?: string }
    const rows = status
      ? (db.prepare('SELECT * FROM plan_proposals WHERE status = ? ORDER BY proposed_at DESC').all(status) as unknown as PlanProposalRow[])
      : (db.prepare('SELECT * FROM plan_proposals ORDER BY proposed_at DESC').all() as unknown as PlanProposalRow[])
    const proposals = rows.map(r => {
      const stored = JSON.parse(r.json)
      // Support both old format (plain ExerciseDef) and new format ({ exercise, warnings })
      const exercise: ExerciseDef = stored.exercise ?? stored
      const warnings: string[] = stored.warnings ?? []
      return { ...r, exercise, warnings }
    })
    return reply.send({ proposals })
  })

  // ── POST /api/plan/propose ──────────────────────────────────────────────────
  app.post<{ Body: { workoutId: 'A' | 'B'; request: string } }>(
    '/api/plan/propose',
    async (req: FastifyRequest<{ Body: { workoutId: 'A' | 'B'; request: string } }>, reply: FastifyReply) => {
      const { workoutId, request: userRequest } = req.body
      if (!workoutId || !userRequest?.trim()) {
        return reply.code(400).send({ error: 'workoutId and request are required' })
      }
      // Service-not-configured (503) is distinct from a failed Anthropic call (502)
      // so the cause is unambiguous in logs and the UI.
      if (!isAiConfigured(db)) {
        return reply.code(503).send({ error: MISSING_KEY_MESSAGE, configured: false })
      }
      const planRow = db.prepare('SELECT json FROM plan WHERE id = 1').get() as { json: string } | undefined
      const plan = planRow ? (JSON.parse(planRow.json) as Plan) : null
      const existingIds = plan ? plan.workouts.flatMap(w => w.exercises.map(e => e.id)) : []
      let exercise: ExerciseDef
      let warnings: string[]
      try {
        ;({ exercise, warnings } = await proposeExercise(db, workoutId, userRequest.trim(), existingIds))
      } catch (err) {
        app.log.error({ err }, '[api] Claude proposal failed')
        return reply.code(502).send({ error: String(err) })
      }
      if (existingIds.includes(exercise.id)) {
        return reply.code(409).send({ error: `Exercise id "${exercise.id}" already exists in the plan` })
      }
      const storedJson = JSON.stringify({ exercise, warnings })
      const result = db.prepare(`
        INSERT INTO plan_proposals (workout_id, request, json, status)
        VALUES (?, ?, ?, 'pending')
      `).run(workoutId, userRequest.trim(), storedJson)
      const proposal: PlanProposalRow = {
        id: Number(result.lastInsertRowid),
        workout_id: workoutId,
        request: userRequest.trim(),
        json: storedJson,
        status: 'pending',
        proposed_at: new Date().toISOString(),
        reviewed_at: null,
      }
      return reply.code(201).send({ proposal: { ...proposal, exercise, warnings } })
    },
  )

  // ── POST /api/plan/approve/:id ──────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/api/plan/approve/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const id = Number(req.params.id)
      const row = db.prepare('SELECT * FROM plan_proposals WHERE id = ?').get(id) as PlanProposalRow | undefined
      if (!row) return reply.code(404).send({ error: 'Proposal not found' })
      if (row.status !== 'pending') {
        return reply.code(409).send({ error: `Proposal is already ${row.status}` })
      }
      let exercise: ExerciseDef
      try {
        const stored = JSON.parse(row.json)
        // Handle both old format (plain ExerciseDef) and new format ({ exercise, warnings })
        const rawExercise = stored.exercise ?? stored
        ;({ exercise } = validateExerciseDef(rawExercise))
      } catch (err) {
        return reply.code(422).send({ error: `Validation failed: ${err}` })
      }
      const planRow = db.prepare('SELECT json, version FROM plan WHERE id = 1').get() as { json: string; version: number } | undefined
      if (!planRow) return reply.code(404).send({ error: 'Plan not found' })
      const plan = JSON.parse(planRow.json) as Plan
      const workout = plan.workouts.find(w => w.id === row.workout_id)
      if (!workout) return reply.code(400).send({ error: `Workout ${row.workout_id} not found in plan` })
      const existingIds = plan.workouts.flatMap(w => w.exercises.map(e => e.id))
      if (existingIds.includes(exercise.id)) {
        return reply.code(409).send({ error: `Exercise id "${exercise.id}" already exists in the plan` })
      }
      workout.exercises.push(exercise)
      const newVersion = planRow.version + 1
      plan.version = newVersion
      db.prepare('UPDATE plan SET json = ?, version = ? WHERE id = 1').run(JSON.stringify(plan), newVersion)
      db.prepare(`UPDATE plan_proposals SET status = 'approved', reviewed_at = ? WHERE id = ?`).run(new Date().toISOString(), id)
      return reply.send({ ok: true, exercise, planVersion: newVersion })
    },
  )

  // ── POST /api/plan/reject/:id ───────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/api/plan/reject/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const id = Number(req.params.id)
      const row = db.prepare('SELECT * FROM plan_proposals WHERE id = ?').get(id) as PlanProposalRow | undefined
      if (!row) return reply.code(404).send({ error: 'Proposal not found' })
      if (row.status !== 'pending') {
        return reply.code(409).send({ error: `Proposal is already ${row.status}` })
      }
      db.prepare(`UPDATE plan_proposals SET status = 'rejected', reviewed_at = ? WHERE id = ?`).run(new Date().toISOString(), id)
      return reply.send({ ok: true })
    },
  )

  // ── Admin: user privilege management (Phase 11, admin-only) ─────────────────
  const VALID_LEVELS: Privilege[] = ['none', 'viewer', 'user', 'admin']

  // GET /api/admin/users → all accounts with their level + created_at
  app.get(
    '/api/admin/users',
    { preHandler: requirePrivilege('admin') },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const rows = db.prepare(`
        SELECT u.cwa_username AS username,
               COALESCE(p.level, 'user') AS level,
               u.created_at AS createdAt
        FROM users u
        LEFT JOIN user_privilege p ON p.user_id = u.id
        ORDER BY u.created_at ASC
      `).all() as { username: string; level: Privilege; createdAt: string }[]
      return reply.send({ users: rows })
    },
  )

  // PUT /api/admin/users/:username/level → change an account's level
  app.put<{ Params: { username: string }; Body: { level: Privilege } }>(
    '/api/admin/users/:username/level',
    {
      preHandler: requirePrivilege('admin'),
      schema: {
        body: {
          type: 'object',
          required: ['level'],
          properties: { level: { type: 'string', enum: VALID_LEVELS } },
        },
      },
    },
    async (req: FastifyRequest<{ Params: { username: string }; Body: { level: Privilege } }>, reply: FastifyReply) => {
      const { username: target } = req.params
      const { level } = req.body
      if (!VALID_LEVELS.includes(level)) {
        return reply.code(400).send({ error: `Invalid level: ${level}` })
      }
      const targetRow = db
        .prepare('SELECT id FROM users WHERE cwa_username = ?')
        .get(target) as { id: number } | undefined
      if (!targetRow) return reply.code(404).send({ error: `Unknown account: ${target}` })

      const currentLevel = (
        db.prepare("SELECT COALESCE(level, 'user') AS level FROM user_privilege WHERE user_id = ?").get(targetRow.id) as
          | { level: Privilege }
          | undefined
      )?.level ?? 'user'

      // Prevent removing the last admin (self-lockout guard).
      if (currentLevel === 'admin' && level !== 'admin') {
        const adminCount = (
          db.prepare("SELECT COUNT(*) AS n FROM user_privilege WHERE level = 'admin'").get() as { n: number }
        ).n
        if (adminCount <= 1) {
          return reply.code(409).send({ error: 'Cannot demote the last admin' })
        }
      }

      const now = new Date().toISOString()
      db.prepare(`
        INSERT INTO user_privilege (user_id, level, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT (user_id) DO UPDATE SET level = excluded.level, updated_at = excluded.updated_at
      `).run(targetRow.id, level, now)

      return reply.send({ ok: true, username: target, level })
    },
  )

  // ── Sessions (Phase 12) ──────────────────────────────────────────────────

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
      const { username } = authedUser(req)
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
    const { username } = authedUser(req)
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
      const state = JSON.parse(stateRow.json) as AppState
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
      const partnerState: AppState = stateRow
        ? (JSON.parse(stateRow.json) as AppState)
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

  // ── Phase 18: Admin — Anthropic API key management ───────────────────────────

  // GET /api/admin/config/ai-key → { configured: bool } — never returns the key value
  app.get(
    '/api/admin/config/ai-key',
    { preHandler: requirePrivilege('admin') },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ configured: isAiConfigured(db) })
    },
  )

  // PUT /api/admin/config/ai-key — upsert the key into server_config
  app.put<{ Body: { key: string } }>(
    '/api/admin/config/ai-key',
    {
      preHandler: requirePrivilege('admin'),
      schema: {
        body: {
          type: 'object',
          required: ['key'],
          properties: { key: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (req: FastifyRequest<{ Body: { key: string } }>, reply: FastifyReply) => {
      const { key } = req.body
      if (!key?.trim()) return reply.code(400).send({ error: 'key is required' })
      const now = new Date().toISOString()
      db.prepare(`
        INSERT INTO server_config (key, value, updated_at)
        VALUES ('anthropic_api_key', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run(key.trim(), now)
      return reply.send({ ok: true })
    },
  )

  // DELETE /api/admin/config/ai-key — remove DB key; env-var fallback may still apply
  app.delete(
    '/api/admin/config/ai-key',
    { preHandler: requirePrivilege('admin') },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      db.prepare("DELETE FROM server_config WHERE key = 'anthropic_api_key'").run()
      return reply.send({ ok: true, configured: Boolean(getApiKey(db)) })
    },
  )
}
