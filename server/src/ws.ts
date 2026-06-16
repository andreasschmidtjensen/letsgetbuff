/**
 * Phase 6 — Live shared exercise reordering via WebSocket
 *
 * Single shared channel (no room abstraction). Authenticated via JWT in the
 * session cookie using Node built-in crypto (HS256 — matches @fastify/jwt default).
 *
 * Protocol:
 *   Client -> Server:
 *     { type: 'reorder',  order: string[], basedOnVersion: number, date: string, workoutType: string }
 *     { type: 'presence', exerciseId: string }
 *
 *   Server -> Client (broadcast):
 *     { type: 'order',    order: string[], version: number }
 *     { type: 'presence', user: string, exerciseId: string | null }
 *
 * Reset rule: order is scoped to (date, workoutType). A new scope triggers a
 * reset to plan order before applying the reorder. Configurable as a user
 * setting in a future phase.
 */

import { IncomingMessage } from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'
import cookie from 'cookie'
import type { DatabaseSync } from 'node:sqlite'
import { getPlan } from '@letsgetbuff/shared'
import { config } from './config.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthedClient extends WebSocket {
  username: string
}

interface LiveOrderRow {
  exercise_order_json: string
  version: number
  scope_date: string | null
  scope_workout: string | null
}

interface JwtPayload {
  sub: number
  username: string
}

// ── JWT HS256 verification (no external dep) ──────────────────────────────────

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function verifyHS256(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, payload, sig] = parts
  const expected = createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url')
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  } catch {
    return null
  }
  try {
    return JSON.parse(b64urlDecode(payload).toString('utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

function verifySessionCookie(rawCookies: string | undefined): JwtPayload | null {
  if (!rawCookies) return null
  const parsed = cookie.parse(rawCookies)
  const token = parsed['session']
  if (!token) return null
  const payload = verifyHS256(token, config.sessionSecret)
  if (!payload) return null
  const sub = payload['sub']
  const username = payload['username']
  if (typeof sub !== 'number' || typeof username !== 'string') return null
  // Check expiry if present
  const exp = payload['exp']
  if (typeof exp === 'number' && Date.now() / 1000 > exp) return null
  return { sub, username }
}

// ── DB helpers ────────────────────────────────────────────────────────────────

function ensureScopeColumns(db: DatabaseSync): void {
  try { db.exec('ALTER TABLE live_order ADD COLUMN scope_date    TEXT') } catch { /* exists */ }
  try { db.exec('ALTER TABLE live_order ADD COLUMN scope_workout TEXT') } catch { /* exists */ }
}

function getLiveOrder(db: DatabaseSync): LiveOrderRow {
  const row = db.prepare(
    'SELECT exercise_order_json, version, scope_date, scope_workout FROM live_order WHERE id = 1'
  ).get() as unknown as LiveOrderRow
  return row
}

function planOrder(): string[] {
  const plan = getPlan()
  return plan.workouts.flatMap(w => w.exercises.map(e => e.id))
}

function resetOrder(db: DatabaseSync, date: string, workoutType: string): LiveOrderRow {
  const order = planOrder()
  const now = new Date().toISOString()
  db.prepare(`
    UPDATE live_order
    SET exercise_order_json = ?, version = 0, scope_date = ?, scope_workout = ?, updated_at = ?
    WHERE id = 1
  `).run(JSON.stringify(order), date, workoutType, now)
  return { exercise_order_json: JSON.stringify(order), version: 0, scope_date: date, scope_workout: workoutType }
}

function persistOrder(db: DatabaseSync, order: string[], version: number, date: string, workoutType: string): void {
  db.prepare(`
    UPDATE live_order
    SET exercise_order_json = ?, version = ?, scope_date = ?, scope_workout = ?, updated_at = ?
    WHERE id = 1
  `).run(JSON.stringify(order), version, date, workoutType, new Date().toISOString())
}

// ── Broadcast ─────────────────────────────────────────────────────────────────

function broadcast(clients: Set<WebSocket>, msg: unknown, skip?: WebSocket): void {
  const text = JSON.stringify(msg)
  for (const c of clients) {
    if (c !== skip && c.readyState === WebSocket.OPEN) c.send(text)
  }
}

// ── WebSocket server factory ──────────────────────────────────────────────────

export function createWsServer(db: DatabaseSync): WebSocketServer {
  ensureScopeColumns(db)

  const wss = new WebSocketServer({ noServer: true })
  const presence = new Map<string, string>()  // username -> exerciseId

  wss.on('connection', (rawWs: WebSocket) => {
    const ws = rawWs as AuthedClient

    // Send current order on connect
    const row = getLiveOrder(db)
    ws.send(JSON.stringify({
      type: 'order',
      order: JSON.parse(row.exercise_order_json) as string[],
      version: row.version,
    }))

    // Send current presence snapshot
    for (const [user, exerciseId] of presence.entries()) {
      if (user !== ws.username) {
        ws.send(JSON.stringify({ type: 'presence', user, exerciseId }))
      }
    }

    ws.on('message', (raw: Buffer) => {
      let msg: Record<string, unknown>
      try { msg = JSON.parse(raw.toString()) as Record<string, unknown> } catch { return }

      if (msg['type'] === 'reorder') {
        const order = msg['order'] as string[]
        const basedOnVersion = msg['basedOnVersion'] as number
        const date = msg['date'] as string
        const workoutType = msg['workoutType'] as string
        if (!Array.isArray(order) || typeof basedOnVersion !== 'number') return

        let current = getLiveOrder(db)

        // Reset if scope changed
        if (current.scope_date !== date || current.scope_workout !== workoutType) {
          current = resetOrder(db, date, workoutType)
        }

        if (basedOnVersion !== current.version) {
          // Stale — snap sender back
          ws.send(JSON.stringify({
            type: 'order',
            order: JSON.parse(current.exercise_order_json) as string[],
            version: current.version,
          }))
          return
        }

        const newVersion = current.version + 1
        persistOrder(db, order, newVersion, date, workoutType)
        const out = { type: 'order', order, version: newVersion }
        ws.send(JSON.stringify(out))
        broadcast(wss.clients, out, ws)

      } else if (msg['type'] === 'presence') {
        const exerciseId = msg['exerciseId'] as string
        if (typeof exerciseId !== 'string') return
        presence.set(ws.username, exerciseId)
        broadcast(wss.clients, { type: 'presence', user: ws.username, exerciseId }, ws)
      }
    })

    ws.on('close', () => {
      presence.delete(ws.username)
      broadcast(wss.clients, { type: 'presence', user: ws.username, exerciseId: null })
    })
  })

  return wss
}

// ── Upgrade auth ──────────────────────────────────────────────────────────────

export function authenticateUpgrade(
  req: IncomingMessage,
  reject: (statusCode: number, message: string) => void,
): JwtPayload | null {
  const payload = verifySessionCookie(req.headers.cookie)
  if (!payload) { reject(401, 'Unauthorized'); return null }
  return payload
}
