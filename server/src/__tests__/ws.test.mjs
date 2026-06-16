/**
 * Phase 6 — WebSocket live reorder tests
 *
 * Race-condition fix: `connect()` installs a message-queue BEFORE the 'open'
 * event fires, so the server's instant init message is never lost.
 *
 * Tests:
 *  1. Version-guard accept: valid version bumps order
 *  2. Version-guard reject: stale basedOnVersion snaps back
 *  3. Broadcast fan-out: reorder from A reaches B
 *  4. Reconnect resync: new connection receives current order
 *  5. Scope reset: new date+workoutType resets to plan order then applies
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import http from 'node:http'
import { createHmac } from 'node:crypto'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const SERVER_ROOT = '/sessions/clever-blissful-maxwell/mnt/GYMN app/letsgetbuff-main/letsgetbuff-main/server'
const req2 = createRequire(resolve(SERVER_ROOT, 'package.json'))
const { WebSocketServer, WebSocket } = req2(resolve(SERVER_ROOT, 'node_modules/node_modules/ws'))

const SECRET = 'test-ws-secret'
const PLAN_ORDER = ['squat', 'press', 'row', 'deadlift']

// ── DB helpers ────────────────────────────────────────────────────────────────

function makeDb() {
  const db = new DatabaseSync(':memory:')
  db.exec([
    'CREATE TABLE live_order (',
    '  id INTEGER PRIMARY KEY CHECK (id=1),',
    '  exercise_order_json TEXT NOT NULL,',
    '  version INTEGER NOT NULL DEFAULT 0,',
    "  updated_at TEXT NOT NULL DEFAULT (datetime('now')),",
    '  scope_date TEXT,',
    '  scope_workout TEXT',
    ');',
    'INSERT INTO live_order (id, exercise_order_json, version)',
    "VALUES (1, '" + JSON.stringify(PLAN_ORDER) + "', 0);",
  ].join('\n'))
  return db
}

function getLiveOrder(db) {
  return db.prepare('SELECT * FROM live_order WHERE id=1').get()
}

function resetOrder(db, date, workoutType) {
  db.prepare(
    "UPDATE live_order SET exercise_order_json=?, version=0, scope_date=?, scope_workout=?, updated_at=datetime('now') WHERE id=1"
  ).run(JSON.stringify(PLAN_ORDER), date, workoutType)
  return getLiveOrder(db)
}

function persistOrder(db, order, version, date, workoutType) {
  db.prepare(
    "UPDATE live_order SET exercise_order_json=?, version=?, scope_date=?, scope_workout=?, updated_at=datetime('now') WHERE id=1"
  ).run(JSON.stringify(order), version, date, workoutType)
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

// ── Mini WS server ────────────────────────────────────────────────────────────

function makeWss(db) {
  const wss = new WebSocketServer({ noServer: true })
  wss.on('connection', (ws, reqObj) => {
    const cookies = parseCookies(reqObj.headers.cookie)
    const payload = cookies.session ? verifyJwt(cookies.session) : null
    ws.username = payload ? payload.username : 'unknown'

    const row = getLiveOrder(db)
    ws.send(JSON.stringify({ type: 'order', order: JSON.parse(row.exercise_order_json), version: row.version }))

    ws.on('message', raw => {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch { return }
      if (msg.type !== 'reorder') return

      let cur = getLiveOrder(db)
      if (cur.scope_date !== msg.date || cur.scope_workout !== msg.workoutType) {
        cur = resetOrder(db, msg.date, msg.workoutType)
      }
      if (msg.basedOnVersion !== cur.version) {
        ws.send(JSON.stringify({ type: 'order', order: JSON.parse(cur.exercise_order_json), version: cur.version }))
        return
      }
      const newVer = cur.version + 1
      persistOrder(db, msg.order, newVer, msg.date, msg.workoutType)
      const out = JSON.stringify({ type: 'order', order: msg.order, version: newVer })
      ws.send(out)
      for (const c of wss.clients) {
        if (c !== ws && c.readyState === WebSocket.OPEN) c.send(out)
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
// The server sends an init message immediately on 'connection', which fires
// before the client emits 'open'. Without buffering, nextMsg() misses it.
function connect(port, username) {
  return new Promise((res, rej) => {
    const token = makeJwt({ sub: 1, username, exp: Math.floor(Date.now() / 1000) + 3600 })
    const ws = new WebSocket('ws://127.0.0.1:' + port, { headers: { cookie: 'session=' + token } })
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
    const ws = await connect(ctx.port, 'jacob')
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
    assert.equal(getLiveOrder(db).version, 1)
    ws.terminate()
  } finally { await stopServer(ctx) }
})

test('2. Version-guard reject: stale basedOnVersion snaps back', async () => {
  const db = makeDb()
  const ctx = await startServer(db)
  try {
    const ws = await connect(ctx.port, 'jacob')
    await nextMsg(ws)
    ws.send(JSON.stringify({ type: 'reorder', order: ['press', 'squat', 'row', 'deadlift'], basedOnVersion: 0, date: '2026-06-14', workoutType: 'A' }))
    const v1 = await nextMsg(ws)
    assert.equal(v1.version, 1)

    ws.send(JSON.stringify({ type: 'reorder', order: ['row', 'squat', 'press', 'deadlift'], basedOnVersion: 0, date: '2026-06-14', workoutType: 'A' }))
    const snap = await nextMsg(ws)
    assert.equal(snap.version, 1)
    assert.deepEqual(snap.order, ['press', 'squat', 'row', 'deadlift'])
    assert.equal(getLiveOrder(db).version, 1)
    ws.terminate()
  } finally { await stopServer(ctx) }
})

test('3. Broadcast fan-out: reorder from A reaches B', async () => {
  const db = makeDb()
  const ctx = await startServer(db)
  try {
    const wsA = await connect(ctx.port, 'jacob')
    const wsB = await connect(ctx.port, 'partner')
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
    const ws1 = await connect(ctx.port, 'jacob')
    await nextMsg(ws1)
    const finalOrder = ['row', 'deadlift', 'press', 'squat']
    ws1.send(JSON.stringify({ type: 'reorder', order: finalOrder, basedOnVersion: 0, date: '2026-06-14', workoutType: 'A' }))
    await nextMsg(ws1)
    ws1.terminate()
    await new Promise(r => setTimeout(r, 50))

    const ws2 = await connect(ctx.port, 'jacob')
    const init = await nextMsg(ws2)
    assert.equal(init.version, 1)
    assert.deepEqual(init.order, finalOrder)
    ws2.terminate()
  } finally { await stopServer(ctx) }
})

test('5. Scope reset: new date triggers reset to plan order then applies', async () => {
  const db = makeDb()
  const ctx = await startServer(db)
  try {
    const ws = await connect(ctx.port, 'jacob')
    await nextMsg(ws)
    ws.send(JSON.stringify({ type: 'reorder', order: ['press', 'squat', 'row', 'deadlift'], basedOnVersion: 0, date: '2026-06-14', workoutType: 'A' }))
    await nextMsg(ws)

    const dayTwoOrder = ['deadlift', 'row', 'squat', 'press']
    ws.send(JSON.stringify({ type: 'reorder', order: dayTwoOrder, basedOnVersion: 0, date: '2026-06-15', workoutType: 'A' }))
    const d2 = await nextMsg(ws)
    assert.equal(d2.version, 1)
    assert.deepEqual(d2.order, dayTwoOrder)
    assert.equal(getLiveOrder(db).scope_date, '2026-06-15')
    ws.terminate()
  } finally { await stopServer(ctx) }
})
