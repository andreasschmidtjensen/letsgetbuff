/**
 * Phase 12 — Training-session entity.
 *
 * A session links one or two of the two users, has a lifecycle (active → ended),
 * and owns the live exercise order. It is the join key for WebSockets + presence.
 * This supersedes the Phase 6 single fixed `live_order` room (id=1) — the order is
 * now keyed per `session_id`. The version-guard last-write-wins protocol and the
 * WS message schema are unchanged; only their scope (per session) changes.
 *
 * "One active session at a time per (scope_date, workout) per user" — we reuse the
 * caller's current active session rather than spawning duplicates. Max 2 participants.
 */

import type { DatabaseSync } from 'node:sqlite'
import { getPlan } from '@letsgetbuff/shared'
import type { Privilege } from '@letsgetbuff/shared'

export interface SessionRow {
  id: number
  scope_date: string
  workout: string
  mode: 'solo' | 'shared'
  status: 'active' | 'ended'
  created_by: number
  created_at: string
  ended_at: string | null
}

export interface Participant {
  username: string
  level: Privilege
}

export interface LiveOrderState {
  order: string[]
  version: number
  scopeDate: string | null
  scopeWorkout: string | null
}

/** Full plan order (all workouts flattened) — same seed Phase 6 used; the client
 *  filters it down to the current workout's exercises. */
function planOrder(): string[] {
  const plan = getPlan()
  return plan.workouts.flatMap(w => w.exercises.map(e => e.id))
}

function getSession(db: DatabaseSync, sessionId: number): SessionRow | null {
  return (db.prepare('SELECT * FROM session WHERE id = ?').get(sessionId) as SessionRow | undefined) ?? null
}

function addParticipant(db: DatabaseSync, sessionId: number, userId: number): void {
  db.prepare(
    'INSERT INTO session_participant (session_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
  ).run(sessionId, userId)
}

export function getParticipants(db: DatabaseSync, sessionId: number): Participant[] {
  return db.prepare(`
    SELECT u.cwa_username AS username, COALESCE(p.level, 'user') AS level
    FROM session_participant sp
    JOIN users u ON u.id = sp.user_id
    LEFT JOIN user_privilege p ON p.user_id = sp.user_id
    WHERE sp.session_id = ?
    ORDER BY sp.joined_at ASC
  `).all(sessionId) as unknown as Participant[]
}

export function isParticipant(db: DatabaseSync, sessionId: number, userId: number): boolean {
  return Boolean(
    db.prepare('SELECT 1 FROM session_participant WHERE session_id = ? AND user_id = ?').get(sessionId, userId),
  )
}

/** The caller's current `active` session for a given (date, workout), or null. */
export function getActiveSessionForScope(
  db: DatabaseSync,
  userId: number,
  scopeDate: string,
  workout: string,
): SessionRow | null {
  return (db.prepare(`
    SELECT s.* FROM session s
    JOIN session_participant sp ON sp.session_id = s.id
    WHERE sp.user_id = ? AND s.scope_date = ? AND s.workout = ? AND s.status = 'active'
    ORDER BY s.created_at DESC
    LIMIT 1
  `).get(userId, scopeDate, workout) as SessionRow | undefined) ?? null
}

// ── Live order (version-guarded, per session) ───────────────────────────────

function seedLiveOrder(db: DatabaseSync, sessionId: number, scopeDate: string, workout: string): void {
  db.prepare(`
    INSERT INTO live_order (session_id, exercise_order_json, version, scope_date, scope_workout)
    VALUES (?, ?, 0, ?, ?)
    ON CONFLICT (session_id) DO NOTHING
  `).run(sessionId, JSON.stringify(planOrder()), scopeDate, workout)
}

export function liveOrderForSession(db: DatabaseSync, sessionId: number): LiveOrderState | null {
  const session = getSession(db, sessionId)
  if (!session) return null
  // Self-heal: a session always has a live-order row (reset rule = plan order at v0).
  seedLiveOrder(db, sessionId, session.scope_date, session.workout)
  const row = db.prepare(
    'SELECT exercise_order_json, version, scope_date, scope_workout FROM live_order WHERE session_id = ?',
  ).get(sessionId) as { exercise_order_json: string; version: number; scope_date: string | null; scope_workout: string | null }
  return {
    order: JSON.parse(row.exercise_order_json) as string[],
    version: row.version,
    scopeDate: row.scope_date,
    scopeWorkout: row.scope_workout,
  }
}

/**
 * Version-guarded write. Accepts iff `basedOnVersion === current`; bumps version
 * and persists. Stale writes return `{ ok: false, current }` so the caller can
 * snap the sender back. Last-write-wins, identical to Phase 6 but per session.
 */
export function setLiveOrderForSession(
  db: DatabaseSync,
  sessionId: number,
  order: string[],
  basedOnVersion: number,
): { ok: true; order: string[]; version: number } | { ok: false; current: LiveOrderState } {
  const current = liveOrderForSession(db, sessionId)
  if (!current) return { ok: false, current: { order: planOrder(), version: 0, scopeDate: null, scopeWorkout: null } }
  if (basedOnVersion !== current.version) {
    return { ok: false, current }
  }
  const newVersion = current.version + 1
  db.prepare(
    'UPDATE live_order SET exercise_order_json = ?, version = ?, updated_at = ? WHERE session_id = ?',
  ).run(JSON.stringify(order), newVersion, new Date().toISOString(), sessionId)
  return { ok: true, order, version: newVersion }
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

export interface GetOrCreateOpts {
  scopeDate: string
  workout: string
  mode?: 'solo' | 'shared'
  partnerId?: number | null
}

export interface SessionSnapshot {
  session: SessionRow
  participants: Participant[]
  order: string[]
  version: number
}

/**
 * Return the caller's current active session for (scopeDate, workout), creating it
 * (+ participant rows + seeded live order) if absent. A `partnerId` makes it shared
 * and adds both participants; passing it for an existing solo session upgrades it.
 */
export function getOrCreateActiveSession(
  db: DatabaseSync,
  userId: number,
  opts: GetOrCreateOpts,
): SessionSnapshot {
  const { scopeDate, workout, partnerId } = opts
  db.exec('BEGIN IMMEDIATE')
  try {
    let session = getActiveSessionForScope(db, userId, scopeDate, workout)
    if (session) {
      // Upgrade an existing session to shared if a partner is now joining.
      if (partnerId != null && partnerId !== userId) {
        addParticipant(db, session.id, partnerId)
        if (session.mode !== 'shared') {
          db.prepare('UPDATE session SET mode = ? WHERE id = ?').run('shared', session.id)
          session = { ...session, mode: 'shared' }
        }
      }
    } else {
      const mode: 'solo' | 'shared' = partnerId != null && partnerId !== userId ? 'shared' : (opts.mode ?? 'solo')
      const res = db.prepare(
        'INSERT INTO session (scope_date, workout, mode, status, created_by) VALUES (?, ?, ?, \'active\', ?)',
      ).run(scopeDate, workout, mode, userId)
      const id = Number(res.lastInsertRowid)
      addParticipant(db, id, userId)
      if (partnerId != null && partnerId !== userId) addParticipant(db, id, partnerId)
      seedLiveOrder(db, id, scopeDate, workout)
      session = getSession(db, id)!
    }
    db.exec('COMMIT')

    const live = liveOrderForSession(db, session.id)!
    return {
      session,
      participants: getParticipants(db, session.id),
      order: live.order,
      version: live.version,
    }
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function getSessionSnapshot(db: DatabaseSync, sessionId: number): SessionSnapshot | null {
  const session = getSession(db, sessionId)
  if (!session) return null
  const live = liveOrderForSession(db, sessionId)!
  return {
    session,
    participants: getParticipants(db, sessionId),
    order: live.order,
    version: live.version,
  }
}

/** End a session (only a participant may end it). Returns false if not allowed/found. */
export function endSession(db: DatabaseSync, sessionId: number, userId: number): boolean {
  const session = getSession(db, sessionId)
  if (!session) return false
  if (!isParticipant(db, sessionId, userId)) return false
  if (session.status === 'ended') return true
  db.prepare("UPDATE session SET status = 'ended', ended_at = ? WHERE id = ?").run(new Date().toISOString(), sessionId)
  return true
}
