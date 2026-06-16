/**
 * Phase 4 — State API tests
 *
 * Tests:
 *  1. GET returns empty default when no state exists
 *  2. PUT upserts state for a user
 *  3. GET retrieves the saved state
 *  4. PUT by a different user does not overwrite the first user's data
 *  5. Server-side migration: PUT state with older schemaVersion still saves (server stores as-is;
 *     the client is responsible for migrating before PUT)
 *
 * Uses Node's built-in test runner (node:test) and the same in-memory SQLite + Fastify
 * setup pattern as auth.test.mjs.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'

// ── Helpers ────────────────────────────────────────────────────────────────

const SESSION_SECRET = 'test-secret-phase4'

function makeApp(db) {
  const app = Fastify({ logger: false })
  app.register(cookie)
  app.register(jwt, { secret: SESSION_SECRET, cookie: { cookieName: 'session', signed: false } })
  return app
}

function makeDb() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE schema_version (id INTEGER PRIMARY KEY CHECK (id=1), version INTEGER NOT NULL);
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cwa_username TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE app_state (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      json TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE user_privilege (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      level TEXT NOT NULL DEFAULT 'user' CHECK (level IN ('none','viewer','user','admin')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  return db
}

function addUser(db, username, level) {
  db.prepare("INSERT INTO users (cwa_username) VALUES (?) ON CONFLICT DO NOTHING").run(username)
  const id = db.prepare("SELECT id FROM users WHERE cwa_username = ?").get(username).id
  if (level) {
    db.prepare(`INSERT INTO user_privilege (user_id, level) VALUES (?, ?)
                ON CONFLICT(user_id) DO UPDATE SET level = excluded.level`).run(id, level)
  }
  return id
}

async function buildServer(db) {
  const app = makeApp(db)

  // Attach authGuard inline (reads JWT from cookie, sets req.user)
  app.addHook('preHandler', async (req, reply) => {
    const token = req.cookies?.session
    if (!token) return reply.code(401).send({ error: 'Not authenticated' })
    try {
      req.user = app.jwt.verify(token)
    } catch {
      return reply.code(401).send({ error: 'Session expired' })
    }
  })

  // Dynamically import api.js (ESM, TS compiled)
  // For tests we import the source via tsx loader
  const { registerApiRoutes } = await import('../api.js')
  registerApiRoutes(app, db)

  await app.ready()
  return app
}

function makeToken(app, userId, username, level) {
  return app.jwt.sign(level ? { sub: userId, username, level } : { sub: userId, username })
}

// ── Tests ──────────────────────────────────────────────────────────────────

test('GET /api/state returns empty default when no state exists', async (t) => {
  const db = makeDb()
  const uid = addUser(db, 'alice')
  const app = await buildServer(db)
  const token = makeToken(app, uid, 'alice')

  const res = await app.inject({
    method: 'GET',
    url: '/api/state',
    cookies: { session: token },
  })
  assert.equal(res.statusCode, 200)
  const body = JSON.parse(res.body)
  assert.equal(body.updatedAt, null)
  assert.deepEqual(body.state.sessions, {})
  assert.equal(body.state.startDate, null)

  await app.close()
})

test('PUT /api/state upserts state and GET retrieves it', async (t) => {
  const db = makeDb()
  const uid = addUser(db, 'bob')
  const app = await buildServer(db)
  const token = makeToken(app, uid, 'bob')

  const statePayload = {
    schemaVersion: 2,
    startDate: '2026-01-01',
    skippedWeeks: [],
    sessions: { '2026-01-02': { workout: 'A', done: true, entries: {} } },
    metrics: {},
    milestones: {},
  }

  // PUT
  const putRes = await app.inject({
    method: 'PUT',
    url: '/api/state',
    cookies: { session: token },
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ state: statePayload }),
  })
  assert.equal(putRes.statusCode, 200)
  const putBody = JSON.parse(putRes.body)
  assert.equal(putBody.ok, true)
  assert.ok(putBody.updatedAt)

  // GET
  const getRes = await app.inject({
    method: 'GET',
    url: '/api/state',
    cookies: { session: token },
  })
  assert.equal(getRes.statusCode, 200)
  const getBody = JSON.parse(getRes.body)
  assert.equal(getBody.state.startDate, '2026-01-01')
  assert.ok(getBody.state.sessions['2026-01-02'])

  await app.close()
})

test('PUT is per-user — two users do not overwrite each other', async (t) => {
  const db = makeDb()
  const uidA = addUser(db, 'anna')
  const uidB = addUser(db, 'bertil')
  const app = await buildServer(db)
  const tokenA = makeToken(app, uidA, 'anna')
  const tokenB = makeToken(app, uidB, 'bertil')

  const stateA = { schemaVersion: 2, startDate: '2026-01-01', skippedWeeks: [], sessions: { 'A': { workout: 'A', done: true, entries: {} } }, metrics: {}, milestones: {} }
  const stateB = { schemaVersion: 2, startDate: '2026-03-01', skippedWeeks: [], sessions: { 'B': { workout: 'B', done: false, entries: {} } }, metrics: {}, milestones: {} }

  await app.inject({ method: 'PUT', url: '/api/state', cookies: { session: tokenA }, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: stateA }) })
  await app.inject({ method: 'PUT', url: '/api/state', cookies: { session: tokenB }, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: stateB }) })

  const resA = await app.inject({ method: 'GET', url: '/api/state', cookies: { session: tokenA } })
  const resB = await app.inject({ method: 'GET', url: '/api/state', cookies: { session: tokenB } })

  assert.equal(JSON.parse(resA.body).state.startDate, '2026-01-01')
  assert.equal(JSON.parse(resB.body).state.startDate, '2026-03-01')

  await app.close()
})

test('PUT overwrites previous state (last-write-wins)', async (t) => {
  const db = makeDb()
  const uid = addUser(db, 'claire')
  const app = await buildServer(db)
  const token = makeToken(app, uid, 'claire')

  const v1 = { schemaVersion: 2, startDate: '2026-01-01', skippedWeeks: [], sessions: {}, metrics: {}, milestones: {} }
  const v2 = { schemaVersion: 2, startDate: '2026-06-01', skippedWeeks: [], sessions: {}, metrics: {}, milestones: {} }

  await app.inject({ method: 'PUT', url: '/api/state', cookies: { session: token }, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: v1 }) })
  await app.inject({ method: 'PUT', url: '/api/state', cookies: { session: token }, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: v2 }) })

  const res = await app.inject({ method: 'GET', url: '/api/state', cookies: { session: token } })
  assert.equal(JSON.parse(res.body).state.startDate, '2026-06-01')

  await app.close()
})

test('GET returns 401 without a session cookie', async (t) => {
  const db = makeDb()
  const app = await buildServer(db)

  const res = await app.inject({ method: 'GET', url: '/api/state' })
  assert.equal(res.statusCode, 401)

  await app.close()
})

// ── Phase 11: privilege gating against the real api.ts ───────────────────────

const VIEWER_STATE = { schemaVersion: 2, startDate: '2026-01-01', skippedWeeks: [], sessions: {}, metrics: {}, milestones: {} }

test('viewer is blocked from PUT /api/state (403) but may GET', async (t) => {
  const db = makeDb()
  const uid = addUser(db, 'val', 'viewer')
  const app = await buildServer(db)
  const token = makeToken(app, uid, 'val', 'viewer')

  const putRes = await app.inject({
    method: 'PUT', url: '/api/state', cookies: { session: token },
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: VIEWER_STATE }),
  })
  assert.equal(putRes.statusCode, 403)

  const getRes = await app.inject({ method: 'GET', url: '/api/state', cookies: { session: token } })
  assert.equal(getRes.statusCode, 200)

  await app.close()
})

test('user level may PUT /api/state (gate only blocks viewer)', async (t) => {
  const db = makeDb()
  const uid = addUser(db, 'ulla', 'user')
  const app = await buildServer(db)
  const token = makeToken(app, uid, 'ulla', 'user')

  const putRes = await app.inject({
    method: 'PUT', url: '/api/state', cookies: { session: token },
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: VIEWER_STATE }),
  })
  assert.equal(putRes.statusCode, 200)

  await app.close()
})

test('GET /api/admin/users returns 403 for non-admin, lists for admin', async (t) => {
  const db = makeDb()
  const adminId = addUser(db, 'jacob', 'admin')
  addUser(db, 'partner', 'user')
  const app = await buildServer(db)

  const userToken = makeToken(app, addUser(db, 'plain', 'user'), 'plain', 'user')
  const denied = await app.inject({ method: 'GET', url: '/api/admin/users', cookies: { session: userToken } })
  assert.equal(denied.statusCode, 403)

  const adminToken = makeToken(app, adminId, 'jacob', 'admin')
  const ok = await app.inject({ method: 'GET', url: '/api/admin/users', cookies: { session: adminToken } })
  assert.equal(ok.statusCode, 200)
  const body = JSON.parse(ok.body)
  const jacob = body.users.find(u => u.username === 'jacob')
  assert.equal(jacob.level, 'admin')

  await app.close()
})

test('admin PUT level changes the other account; last-admin demotion blocked', async (t) => {
  const db = makeDb()
  const adminId = addUser(db, 'jacob', 'admin')
  addUser(db, 'partner', 'user')
  const app = await buildServer(db)
  const adminToken = makeToken(app, adminId, 'jacob', 'admin')

  // Change partner → viewer
  const change = await app.inject({
    method: 'PUT', url: '/api/admin/users/partner/level', cookies: { session: adminToken },
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ level: 'viewer' }),
  })
  assert.equal(change.statusCode, 200)
  assert.equal(JSON.parse(change.body).level, 'viewer')

  // jacob is the last admin — demoting self must be rejected
  const selfDemote = await app.inject({
    method: 'PUT', url: '/api/admin/users/jacob/level', cookies: { session: adminToken },
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ level: 'user' }),
  })
  assert.equal(selfDemote.statusCode, 409)

  await app.close()
})
