/**
 * Phase 6 / Phase 12 — Live shared exercise reordering via WebSocket.
 *
 * Connections are now scoped to a **session** (Phase 12) instead of one fixed
 * global room. The WS URL carries `?sessionId=<n>`; the order version-guard and
 * the presence Map are keyed per session. The message schema and the version-guard
 * last-write-wins contract are unchanged from Phase 6 — only the scope changed.
 *
 * Authenticated via the session-cookie JWT, verified by the SAME @fastify/jwt
 * instance the HTTP routes use (the upgrade handler passes its verify function
 * in) — one verifier implementation, no drift.
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
import { WebSocketServer, WebSocket } from 'ws'
import cookie from 'cookie'
import type { DatabaseSync } from 'node:sqlite'
import type { Privilege } from '@letsgetbuff/shared'
import { liveOrderForSession, setLiveOrderForSession, isParticipant } from './sessions.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthedClient extends WebSocket {
  username: string
  userId: number
  sessionId: number
  level: Privilege
}

interface JwtPayload {
  sub: number
  username: string
  level: Privilege
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
        // Read-only invariant: a viewer must never mutate the shared order. Snap
        // them back to the authoritative current order instead of applying it.
        if (ws.level === 'viewer') {
          const live = liveOrderForSession(db, ws.sessionId)
          if (live) ws.send(JSON.stringify({ type: 'order', order: live.order, version: live.version }))
          return
        }
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

/** Verifies a session token and returns its claims; throws if invalid/expired. */
export type TokenVerifier = (token: string) => unknown

export function authenticateUpgrade(
  req: IncomingMessage,
  verify: TokenVerifier,
  reject: (statusCode: number, message: string) => void,
): JwtPayload | null {
  const raw = req.headers.cookie
  const token = raw ? cookie.parse(raw)['session'] : undefined
  if (!token) { reject(401, 'Unauthorized'); return null }
  let payload: Record<string, unknown>
  try {
    payload = verify(token) as Record<string, unknown> // exp checked by the verifier
  } catch {
    reject(401, 'Unauthorized')
    return null
  }
  const sub = payload['sub']
  const username = payload['username']
  if (typeof sub !== 'number' || typeof username !== 'string') { reject(401, 'Unauthorized'); return null }
  // Older tokens predate the level claim — treat as 'user' (same as auth.meHandler).
  const rawLevel = payload['level']
  const level: Privilege = rawLevel === 'none' || rawLevel === 'viewer' || rawLevel === 'admin' ? rawLevel : 'user'
  return { sub, username, level }
}
