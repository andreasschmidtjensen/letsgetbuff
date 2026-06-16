/**
 * Phase 6 / Phase 12 — WebSocket live reorder tests (session-scoped).
 *
 * The mini-server mirrors ws.ts: each connection carries `?sessionId=<n>`, and the
 * live order + version-guard + broadcast are scoped per session. Reset rule: a
 * session's order is seeded to plan order at version 0 on first use.
 *
 * Race-condition fix: connect() installs a message queue BEFORE 'open' fires so
 * the server's instant init message is never lost.
 *
 * Tests:
 *  1. Version-guard accept: valid version bumps order
 *  2. Version-guard reject: stale basedOnVersion snaps back
 *  3. Broadcast fan-out: reorder from A reaches B (same session)
 *  4. Reconnect resync: new connection to the session receives current order
 *  5. Session isolation: a second session is independent (starts from plan order)
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import http from 'node:http'
import { createHmac } from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'

const SECRET = 'test-ws-secret'
const PLAN_ORDER = ['squat', 'press', 'row', 'deadlift']

// ── DB helpers (session-scoped live_order) ──────────────────────────────────────

function makeDb() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE live_order (
      session_id          INTEGER PRIMARY KEY,
      exercise_order_json TEXT NOT NULL,
      version             INTEGER NOT NULL DEFAULT 0,
      scope_date          TEXT,
      scope_workout       TEXT,
      updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  return db
}

function getLiveOrder(db, sessionId) {
  // Self-heal: seed plan order at v0 (mirrors sessions.ts seedLiveOrder)
  db.prepare(
    'INSERT INTO live_order (session_id, exercise_order_json, version) VALUES (?, ?, 0) ON CONFLICT (session_id) DO NOTHING'
  ).run(sessionId, JSON.stringify(PLAN_ORDER))
  return db.prepare('SELECT * FROM live_order WHERE session_id = ?').get(sessionId)
}

function persistOrder(db, sessionId, order, version) {
  db.prepare(
    "UPDATE live_order SET exercise_order_json=?, version=?, updated_at=datetime('now') WHERE session_id=?"
  ).run(JSON.stringify(order), version, sessionId)
}

// ── JWT helpers ───────────────────────────────────────────────────────────────

function makeJwt(payload) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const b = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const s = createHmac('sha256', SECRET).update(h + '.' + b).digest('base64url')
  return h + '.' + b + '.' + s
}

function verifyJwt(token) {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [h, b, s] = parts
  const expected = createHmac('sha256', SECRET).update(h + '.' + b).digest('base64url')
  if (s !== expected) return null
  try {
    const p = JSON.parse(Buffer.from(b.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())
    if (p.exp && Date.now() / 1000 > p.exp) return null
    return p
  } catch { return null }
}

function parseCookies(header) {
  const out = {}
  for (const part of (header || '').split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim()
  }
  return out
}

function sessionIdFromUrl(url) {
  const u = new URL(url, 'http://localhost')
  return Number(u.searchParams.get('sessionId'))
}

// ── Mini WS server (session-scoped) ─────────────────────────────────────────────

function makeWss(db) {
  const wss = new WebSocketServer({ noServer: true })
  wss.on('connection', (ws, reqObj) => {
    const cookies = parseCookies(reqObj.headers.cookie)
    const payload = cookies.session ? verifyJwt(cookies.session) : null
    ws.username = payload ? payload.username : 'unknown'
    ws.sessionId = sessionIdFromUrl(reqObj.url)

    const row = getLiveOrder(db, ws.sessionId)
    ws.send(JSON.stringify({ type: 'order', order: JSON.parse(row.exercise_order_json), version: row.version }))

    ws.on('message', raw => {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch { return }
      if (msg.type !== 'reorder') return

      const cur = getLiveOrder(db, ws.sessionId)
      if (msg.basedOnVersion !== cur.version) {
        ws.send(JSON.stringify({ type: 'order', order: JSON.parse(cur.exercise_order_json), version: cur.version }))
        return
      }
      const newVer = cur.version + 1
      persistOrder(db, ws.sessionId, msg.order, newVer)
      const out = JSON.stringify({ type: 'order', order: msg.order, version: newVer })
      ws.send(out)
      for (const c of wss.clients) {
        if (c !== ws && c.sessionId === ws.sessionId && c.readyState === WebSocket.OPEN) c.send(out)
      }
    })
  })
  return wss
}

function startServer(db) {
  const wss = makeWss(db)
  const server = http.createServer()
  server.on('upgrade', (reqObj, socket, head) => {
    const cookies = parseCookies(reqObj.headers.cookie)
    if (!cookies.session || !verifyJwt(cookies.session)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(reqObj, socket, head, ws => wss.emit('connection', ws, reqObj))
  })
  return new Promise(res => server.listen(0, '127.0.0.1', () => res({ server, wss, port: server.address().port })))
}

function stopServer({ server, wss }) {
  for (const ws of wss.clients) ws.terminate()
  return new Promise(res => { wss.close(() => server.close(res)) })
}

// FIX: Buffer messages from the moment the WebSocket is created.
function connect(port, username, sessionId = 1) {
  return new Promise((res, rej) => {
    const token = makeJwt({ sub: 1, username, exp: Math.floor(Date.now() / 1000) + 3600 })
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws?sessionId=' + sessionId, { headers: { cookie: 'session=' + token } })
    ws._queue = []
    ws._waiters = []
    ws.on('message', d => {
      const msg = JSON.parse(d.toString())
      if (ws._waiters.length) ws._waiters.shift()(msg)
      else ws._queue.push(msg)
    })
    ws.once('open', () => res(ws))
    ws.once('error', rej)
  })
}

function nextMsg(ws) {
  return new Promise((res, rej) => {
    if (ws._queue && ws._queue.length) { res(ws._queue.shift()); return }
    ws._waiters = ws._waiters || []
    ws._waiters.push(res)
    ws.once('error', rej)
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('1. Version-guard accept: valid version bumps order', async () => {
  const db = makeDb()
  const ctx = await startServer(db)
  try {
    const ws = await connect(ctx.port, 'jacob', 1)
    const init = await nextMsg(ws)
    assert.equal(init.type, 'order')
    assert.equal(init.version, 0)
    assert.deepEqual(init.order, PLAN_ORDER)

    const newOrder = ['press', 'squat', 'row', 'deadlift']
    ws.send(JSON.stringify({ type: 'reorder', order: newOrder, basedOnVersion: 0, date: '2026-06-14', workoutType: 'A' }))
    const reply = await nextMsg(ws)
    assert.equal(reply.type, 'order')
    assert.equal(reply.version, 1)
    assert.deepEqual(reply.order, newOrder)
    assert.equal(getLiveOrder(db, 1).version, 1)
    ws.terminate()
  } finally { await stopServer(ctx) }
})

test('2. Version-guard reject: stale basedOnVersion snaps back', async () => {
  const db = makeDb()
  const ctx = await startServer(db)
  try {
    const ws = await connect(ctx.port, 'jacob', 1)
    await nextMsg(ws)
    ws.send(JSON.stringify({ type: 'reorder', order: ['press', 'squat', 'row', 'deadlift'], basedOnVersion: 0, date: '2026-06-14', workoutType: 'A' }))
    const v1 = await nextMsg(ws)
    assert.equal(v1.version, 1)

    ws.send(JSON.stringify({ type: 'reorder', order: ['row', 'squat', 'press', 'deadlift'], basedOnVersion: 0, date: '2026-06-14', workoutType: 'A' }))
    const snap = await nextMsg(ws)
    assert.equal(snap.version, 1)
    assert.deepEqual(snap.order, ['press', 'squat', 'row', 'deadlift'])
    assert.equal(getLiveOrder(db, 1).version, 1)
    ws.terminate()
  } finally { await stopServer(ctx) }
})

test('3. Broadcast fan-out: reorder from A reaches B (same session)', async () => {
  const db = makeDb()
  const ctx = await startServer(db)
  try {
    const wsA = await connect(ctx.port, 'jacob', 1)
    const wsB = await connect(ctx.port, 'partner', 1)
    await nextMsg(wsA)
    await nextMsg(wsB)

    const newOrder = ['deadlift', 'squat', 'press', 'row']
    wsA.send(JSON.stringify({ type: 'reorder', order: newOrder, basedOnVersion: 0, date: '2026-06-14', workoutType: 'A' }))
    await nextMsg(wsA)
    const fromB = await nextMsg(wsB)
    assert.equal(fromB.type, 'order')
    assert.deepEqual(fromB.order, newOrder)
    assert.equal(fromB.version, 1)
    wsA.terminate(); wsB.terminate()
  } finally { await stopServer(ctx) }
})

test('4. Reconnect resync: new connection receives current order', async () => {
  const db = makeDb()
  const ctx = await startServer(db)
  try {
    const ws1 = await connect(ctx.port, 'jacob', 1)
    await nextMsg(ws1)
    const finalOrder = ['row', 'deadlift', 'press', 'squat']
    ws1.send(JSON.stringify({ type: 'reorder', order: finalOrder, basedOnVersion: 0, date: '2026-06-14', workoutType: 'A' }))
    await nextMsg(ws1)
    ws1.terminate()
    await new Promise(r => setTimeout(r, 50))

    const ws2 = await connect(ctx.port, 'jacob', 1)
    const init = await nextMsg(ws2)
    assert.equal(init.version, 1)
    assert.deepEqual(init.order, finalOrder)
    ws2.terminate()
  } finally { await stopServer(ctx) }
})

test('5. Session isolation: a second session is independent (plan order)', async () => {
  const db = makeDb()
  const ctx = await startServer(db)
  try {
    // Session 1: reorder to v1
    const ws1 = await connect(ctx.port, 'jacob', 1)
    await nextMsg(ws1)
    const s1Order = ['deadlift', 'row', 'squat', 'press']
    ws1.send(JSON.stringify({ type: 'reorder', order: s1Order, basedOnVersion: 0, date: '2026-06-14', workoutType: 'A' }))
    const s1Reply = await nextMsg(ws1)
    assert.equal(s1Reply.version, 1)

    // Session 2: a different session — still plan order at v0, untouched by session 1
    const ws2 = await connect(ctx.port, 'jacob', 2)
    const s2Init = await nextMsg(ws2)
    assert.equal(s2Init.version, 0)
    assert.deepEqual(s2Init.order, PLAN_ORDER)

    // Session 1 remains independent
    assert.equal(getLiveOrder(db, 1).version, 1)
    assert.equal(getLiveOrder(db, 2).version, 0)
    ws1.terminate(); ws2.terminate()
  } finally { await stopServer(ctx) }
})
