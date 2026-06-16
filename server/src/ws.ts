/**
 * Phase 6 / Phase 12 — Live shared exercise reordering via WebSocket.
 *
 * Connections are now scoped to a **session** (Phase 12) instead of one fixed
 * global room. The WS URL carries `?sessionId=<n>`; the order version-guard and
 * the presence Map are keyed per session. The message schema and the version-guard
 * last-write-wins contract are unchanged from Phase 6 — only the scope changed.
 *
 * Authenticated via the session-cookie JWT (HS256) using Node built-in crypto.
 *
 * Protocol (unchanged):
 *   Client -> Server:
 *     { type: 'reorder',  order: string[], basedOnVersion: number, date: string, workoutType: string }
 *     { type: 'presence', exerciseId: string }
 *   Server -> Client:
 *     { type: 'order',    order: string[], version: number }
 *     { type: 'presence', user: string, exerciseId: string | null }
 *
 * Reset rule: each session owns its own live_order row, seeded to plan order at
 * version 0 when the session is created — so "new scope = new session" already
 * starts from plan order (handled in sessions.ts).
 */

import { IncomingMessage } from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'
import cookie from 'cookie'
import type { DatabaseSync } from 'node:sqlite'
import { config } from './config.js'
import { liveOrderForSession, setLiveOrderForSession, isParticipant } from './sessions.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthedClient extends WebSocket {
  username: string
  userId: number
  sessionId: number
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

// ── WebSocket server factory ──────────────────────────────────────────────────

export function createWsServer(db: DatabaseSync): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true })
  // sessionId -> (username -> exerciseId). Presence is in-memory only, per session.
  const presenceBySession = new Map<number, Map<string, string>>()

  function presenceFor(sessionId: number): Map<string, string> {
    let m = presenceBySession.get(sessionId)
    if (!m) { m = new Map(); presenceBySession.set(sessionId, m) }
    return m
  }

  function broadcastToSession(sessionId: number, msg: unknown, skip?: WebSocket): void {
    const text = JSON.stringify(msg)
    for (const c of wss.clients) {
      const ac = c as AuthedClient
      if (ac.sessionId === sessionId && c !== skip && c.readyState === WebSocket.OPEN) c.send(text)
    }
  }

  wss.on('connection', (rawWs: WebSocket) => {
    const ws = rawWs as AuthedClient

    // sessionId/userId/username are set on the socket by the upgrade handler.
    // Guard: only participants of the session may join.
    if (!ws.sessionId || !isParticipant(db, ws.sessionId, ws.userId)) {
      ws.close()
      return
    }

    // Send current order for this session on connect
    const live = liveOrderForSession(db, ws.sessionId)
    if (live) {
      ws.send(JSON.stringify({ type: 'order', order: live.order, version: live.version }))
    }

    // Send current presence snapshot for this session
    for (const [user, exerciseId] of presenceFor(ws.sessionId).entries()) {
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
        if (!Array.isArray(order) || typeof basedOnVersion !== 'number') return

        const result = setLiveOrderForSession(db, ws.sessionId, order, basedOnVersion)
        if (!result.ok) {
          // Stale — snap sender back to the session's current order
          ws.send(JSON.stringify({ type: 'order', order: result.current.order, version: result.current.version }))
          return
        }
        const out = { type: 'order', order: result.order, version: result.version }
        ws.send(JSON.stringify(out))
        broadcastToSession(ws.sessionId, out, ws)

      } else if (msg['type'] === 'presence') {
        const exerciseId = msg['exerciseId'] as string
        if (typeof exerciseId !== 'string') return
        presenceFor(ws.sessionId).set(ws.username, exerciseId)
        broadcastToSession(ws.sessionId, { type: 'presence', user: ws.username, exerciseId }, ws)
      }
    })

    ws.on('close', () => {
      const presence = presenceBySession.get(ws.sessionId)
      if (presence) {
        presence.delete(ws.username)
        if (presence.size === 0) presenceBySession.delete(ws.sessionId)
      }
      broadcastToSession(ws.sessionId, { type: 'presence', user: ws.username, exerciseId: null })
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
