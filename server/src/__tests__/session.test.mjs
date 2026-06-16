/**
 * Phase 12 — Session-entity backend tests.
 *
 * Exercises the REAL sessions.ts logic against an in-memory SQLite matching the
 * v4 schema. Covers: get-or-create idempotency, solo vs shared participants,
 * version-guard accept/reject scoped per session (two sessions don't interfere),
 * reset-on-new-session, and end-session.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'

import {
  getOrCreateActiveSession,
  getActiveSessionForScope,
  getSessionSnapshot,
  liveOrderForSession,
  setLiveOrderForSession,
  endSession,
  getParticipants,
} from '../sessions.js'

function makeDb() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cwa_username TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE user_privilege (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      level TEXT NOT NULL DEFAULT 'user' CHECK (level IN ('none','viewer','user','admin')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE session (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      scope_date  TEXT NOT NULL,
      workout     TEXT NOT NULL,
      mode        TEXT NOT NULL DEFAULT 'solo'   CHECK (mode IN ('solo','shared')),
      status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
      created_by  INTEGER NOT NULL REFERENCES users(id),
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at    TEXT
    );
    CREATE TABLE session_participant (
      session_id  INTEGER NOT NULL REFERENCES session(id),
      user_id     INTEGER NOT NULL REFERENCES users(id),
      joined_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (session_id, user_id)
    );
    CREATE TABLE live_order (
      session_id          INTEGER PRIMARY KEY REFERENCES session(id),
      exercise_order_json TEXT NOT NULL,
      version             INTEGER NOT NULL DEFAULT 0,
      scope_date          TEXT,
      scope_workout       TEXT,
      updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  return db
}

function addUser(db, username, level = 'user') {
  const id = Number(db.prepare('INSERT INTO users (cwa_username) VALUES (?)').run(username).lastInsertRowid)
  db.prepare('INSERT INTO user_privilege (user_id, level) VALUES (?, ?)').run(id, level)
  return id
}

test('get-or-create is idempotent for the same (date, workout)', () => {
  const db = makeDb()
  const jacob = addUser(db, 'jacob')
  const a = getOrCreateActiveSession(db, jacob, { scopeDate: '2026-06-16', workout: 'A', mode: 'solo' })
  const b = getOrCreateActiveSession(db, jacob, { scopeDate: '2026-06-16', workout: 'A', mode: 'solo' })
  assert.equal(a.session.id, b.session.id)
  // exactly one session row exists
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM session').get().n, 1)
})

test('a different (date, workout) is a separate session', () => {
  const db = makeDb()
  const jacob = addUser(db, 'jacob')
  const a = getOrCreateActiveSession(db, jacob, { scopeDate: '2026-06-16', workout: 'A', mode: 'solo' })
  const b = getOrCreateActiveSession(db, jacob, { scopeDate: '2026-06-16', workout: 'B', mode: 'solo' })
  assert.notEqual(a.session.id, b.session.id)
})

test('solo session has one participant; shared has two', () => {
  const db = makeDb()
  const jacob = addUser(db, 'jacob')
  const partner = addUser(db, 'partner')

  const solo = getOrCreateActiveSession(db, jacob, { scopeDate: '2026-06-16', workout: 'A', mode: 'solo' })
  assert.equal(solo.session.mode, 'solo')
  assert.equal(solo.participants.length, 1)

  const shared = getOrCreateActiveSession(db, jacob, { scopeDate: '2026-06-17', workout: 'A', partnerId: partner })
  assert.equal(shared.session.mode, 'shared')
  assert.equal(shared.participants.length, 2)
  const names = shared.participants.map(p => p.username).sort()
  assert.deepEqual(names, ['jacob', 'partner'])
})

test('adding a partner upgrades an existing solo session to shared', () => {
  const db = makeDb()
  const jacob = addUser(db, 'jacob')
  const partner = addUser(db, 'partner')
  const solo = getOrCreateActiveSession(db, jacob, { scopeDate: '2026-06-16', workout: 'A', mode: 'solo' })
  assert.equal(solo.session.mode, 'solo')
  const shared = getOrCreateActiveSession(db, jacob, { scopeDate: '2026-06-16', workout: 'A', partnerId: partner })
  assert.equal(shared.session.id, solo.session.id) // same session, upgraded
  assert.equal(shared.session.mode, 'shared')
  assert.equal(getParticipants(db, shared.session.id).length, 2)
})

test('a new session starts from plan order at version 0 (reset rule)', () => {
  const db = makeDb()
  const jacob = addUser(db, 'jacob')
  const s = getOrCreateActiveSession(db, jacob, { scopeDate: '2026-06-16', workout: 'A', mode: 'solo' })
  assert.equal(s.version, 0)
  assert.ok(Array.isArray(s.order) && s.order.length > 0)

  // mutate the order, then end + start a fresh session for a new day → resets
  setLiveOrderForSession(db, s.session.id, [...s.order].reverse(), 0)
  endSession(db, s.session.id, jacob)
  const fresh = getOrCreateActiveSession(db, jacob, { scopeDate: '2026-06-18', workout: 'A', mode: 'solo' })
  assert.equal(fresh.version, 0)
  assert.deepEqual(fresh.order, s.order) // back to plan order
})

test('version-guard: accept on matching version, reject (snap-back) on stale', () => {
  const db = makeDb()
  const jacob = addUser(db, 'jacob')
  const s = getOrCreateActiveSession(db, jacob, { scopeDate: '2026-06-16', workout: 'A', mode: 'solo' })
  const reordered = [...s.order].reverse()

  const ok = setLiveOrderForSession(db, s.session.id, reordered, 0)
  assert.equal(ok.ok, true)
  assert.equal(ok.version, 1)
  assert.deepEqual(ok.order, reordered)

  // stale write based on version 0 is rejected; caller is handed current state
  const stale = setLiveOrderForSession(db, s.session.id, s.order, 0)
  assert.equal(stale.ok, false)
  assert.equal(stale.current.version, 1)
  assert.deepEqual(stale.current.order, reordered)
})

test('two sessions have independent live orders (no interference)', () => {
  const db = makeDb()
  const jacob = addUser(db, 'jacob')
  const s1 = getOrCreateActiveSession(db, jacob, { scopeDate: '2026-06-16', workout: 'A', mode: 'solo' })
  const s2 = getOrCreateActiveSession(db, jacob, { scopeDate: '2026-06-16', workout: 'B', mode: 'solo' })

  const r1 = [...s1.order].reverse()
  setLiveOrderForSession(db, s1.session.id, r1, 0)

  // s2 is untouched: still version 0, plan order
  const live2 = liveOrderForSession(db, s2.session.id)
  assert.equal(live2.version, 0)
  assert.deepEqual(live2.order, s2.order)

  // s1 reflects its own change
  const live1 = liveOrderForSession(db, s1.session.id)
  assert.equal(live1.version, 1)
  assert.deepEqual(live1.order, r1)
})

test('endSession flips status and only a participant may end', () => {
  const db = makeDb()
  const jacob = addUser(db, 'jacob')
  const stranger = addUser(db, 'stranger')
  const s = getOrCreateActiveSession(db, jacob, { scopeDate: '2026-06-16', workout: 'A', mode: 'solo' })

  // a non-participant cannot end it
  assert.equal(endSession(db, s.session.id, stranger), false)
  assert.equal(getSessionSnapshot(db, s.session.id).session.status, 'active')

  // a participant can
  assert.equal(endSession(db, s.session.id, jacob), true)
  assert.equal(getSessionSnapshot(db, s.session.id).session.status, 'ended')

  // ending clears it from the active-scope lookup → a fresh start creates a new one
  assert.equal(getActiveSessionForScope(db, jacob, '2026-06-16', 'A'), null)
  const next = getOrCreateActiveSession(db, jacob, { scopeDate: '2026-06-16', workout: 'A', mode: 'solo' })
  assert.notEqual(next.session.id, s.session.id)
})
