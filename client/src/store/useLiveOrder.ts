/**
 * Phase 6 / Phase 12 — Live shared exercise order hook (session-aware).
 *
 * Connects to /ws?sessionId=<n>, authenticates via the session cookie (sent
 * automatically), and keeps the local exercise order in sync with the session's
 * live_order row on the server.
 *
 * Session resolution (Phase 12): callers may pass an explicit `sessionId`
 * (Phase 13's start-flow does). When omitted, the hook auto-creates/fetches a
 * SOLO session for the current (date, workoutType) via POST /api/session so the
 * existing WorkoutView keeps working unchanged. Reset rule: each session starts
 * from plan order (server-seeded at creation).
 */

import { useState, useEffect, useRef, useCallback } from 'react'

export type WsStatus = 'connecting' | 'open' | 'closed'

interface UseLiveOrderOptions {
  /** Full plan order — used as fallback when WS is unavailable or scope resets. */
  planOrder: string[]
  date: string
  workoutType: string
  username: string
  /** Only connect when viewing a gym workout. */
  enabled: boolean
  /** Explicit session to bind to (Phase 13). When omitted, a solo session is auto-created. */
  sessionId?: number | null
}

export interface UseLiveOrderResult {
  order: string[]
  reorder: (newOrder: string[]) => void
  wsStatus: WsStatus
  /** Map of username → exerciseId for the other connected user(s). */
  partnerPresence: Map<string, string>
  sendPresence: (exerciseId: string) => void
  /** The session id the hook is currently bound to (null until resolved). */
  sessionId: number | null
}

const RECONNECT_DELAY_MS = 3000
const MAX_RECONNECT_DELAY_MS = 30000

export function useLiveOrder({
  planOrder,
  date,
  workoutType,
  username,
  enabled,
  sessionId: explicitSessionId,
}: UseLiveOrderOptions): UseLiveOrderResult {
  const [order, setOrder] = useState<string[]>(planOrder)
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting')
  const [partnerPresence, setPartnerPresence] = useState<Map<string, string>>(new Map())
  const [sessionId, setSessionId] = useState<number | null>(explicitSessionId ?? null)

  // Current server-confirmed version (for optimistic version guard)
  const versionRef = useRef<number>(0)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectDelay = useRef(RECONNECT_DELAY_MS)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmounted = useRef(false)
  const sessionIdRef = useRef<number | null>(explicitSessionId ?? null)

  // Keep date/workoutType in refs so the send callbacks don't need to change
  const dateRef = useRef(date)
  const workoutTypeRef = useRef(workoutType)
  dateRef.current = date
  workoutTypeRef.current = workoutType

  // ── Resolve which session to bind to on scope change ──────────────────────
  useEffect(() => {
    unmounted.current = false
    if (!enabled) {
      setOrder(planOrder)
      setSessionId(null)
      sessionIdRef.current = null
      return
    }

    let cancelled = false

    const seedFrom = (id: number, ord: string[], ver: number) => {
      if (cancelled) return
      versionRef.current = ver
      setOrder(ord)
      sessionIdRef.current = id
      setSessionId(id)
    }

    if (explicitSessionId != null) {
      // Bind to a caller-provided session: fetch its current order.
      fetch(`/api/session/${explicitSessionId}/live-order`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then((data: { order: string[]; version: number } | null) => {
          if (data) seedFrom(explicitSessionId, data.order, data.version)
          else seedFrom(explicitSessionId, planOrder, 0)
        })
        .catch(() => { /* keep last-known */ })
    } else {
      // Auto-create / fetch a solo session for this (date, workout).
      fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ scopeDate: date, workout: workoutType, mode: 'solo' }),
      })
        .then(r => r.ok ? r.json() : null)
        .then((data: { session: { id: number }; order: string[]; version: number } | null) => {
          if (data?.session) seedFrom(data.session.id, data.order, data.version)
        })
        .catch(() => { /* offline — stay on plan order, no live sync */ })
    }

    return () => { cancelled = true }
    // planOrder intentionally excluded — it's derived from date/workoutType.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, workoutType, enabled, explicitSessionId])

  // ── Connect the WS to the resolved session ────────────────────────────────
  const connect = useCallback((id: number) => {
    if (unmounted.current || !enabled) return

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${window.location.host}/ws?sessionId=${id}`)
    wsRef.current = ws
    setWsStatus('connecting')

    ws.onopen = () => {
      if (unmounted.current) { ws.close(); return }
      setWsStatus('open')
      reconnectDelay.current = RECONNECT_DELAY_MS
    }

    ws.onmessage = (event: MessageEvent<string>) => {
      let msg: unknown
      try { msg = JSON.parse(event.data) } catch { return }
      if (typeof msg !== 'object' || msg === null) return
      const m = msg as Record<string, unknown>

      if (m.type === 'order') {
        versionRef.current = m.version as number
        setOrder(m.order as string[])
      } else if (m.type === 'presence') {
        const user = m.user as string
        const exerciseId = m.exerciseId as string | null
        if (user === username) return
        setPartnerPresence(prev => {
          const next = new Map(prev)
          if (exerciseId == null) {
            next.delete(user)
          } else {
            next.set(user, exerciseId)
          }
          return next
        })
      }
    }

    ws.onclose = () => {
      if (unmounted.current) return
      setWsStatus('closed')
      wsRef.current = null
      const reconnectId = sessionIdRef.current
      if (reconnectId == null) return
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, MAX_RECONNECT_DELAY_MS)
        connect(reconnectId)
      }, reconnectDelay.current)
    }
  }, [enabled, username])

  // Open/close the connection when the bound session changes
  useEffect(() => {
    unmounted.current = false
    setPartnerPresence(new Map())
    if (enabled && sessionId != null) {
      connect(sessionId)
    } else {
      setWsStatus('closed')
    }
    return () => {
      unmounted.current = true
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [enabled, sessionId, connect])

  const reorder = useCallback((newOrder: string[]) => {
    setOrder(newOrder)  // optimistic
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({
      type: 'reorder',
      order: newOrder,
      basedOnVersion: versionRef.current,
      date: dateRef.current,
      workoutType: workoutTypeRef.current,
    }))
  }, [])

  const sendPresence = useCallback((exerciseId: string) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: 'presence', exerciseId }))
  }, [])

  return { order, reorder, wsStatus, partnerPresence, sendPresence, sessionId }
}
