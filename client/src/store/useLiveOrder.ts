/**
 * Phase 6 — Live shared exercise order hook
 *
 * Connects to /ws, authenticates via the session cookie (sent automatically),
 * and keeps the local exercise order in sync with the server's live_order row.
 *
 * Reset rule: order is scoped to (date, workoutType). When either changes the
 * hook fetches the current server order, which will itself have already reset
 * to plan order for the new scope.
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
}

export interface UseLiveOrderResult {
  order: string[]
  reorder: (newOrder: string[]) => void
  wsStatus: WsStatus
  /** Map of username → exerciseId for the other connected user(s). */
  partnerPresence: Map<string, string>
  sendPresence: (exerciseId: string) => void
}

const RECONNECT_DELAY_MS = 3000
const MAX_RECONNECT_DELAY_MS = 30000

export function useLiveOrder({
  planOrder,
  date,
  workoutType,
  username,
  enabled,
}: UseLiveOrderOptions): UseLiveOrderResult {
  const [order, setOrder] = useState<string[]>(planOrder)
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting')
  const [partnerPresence, setPartnerPresence] = useState<Map<string, string>>(new Map())

  // Current server-confirmed version (for optimistic version guard)
  const versionRef = useRef<number>(0)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectDelay = useRef(RECONNECT_DELAY_MS)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmounted = useRef(false)

  // Keep date/workoutType in refs so the send callbacks don't need to change
  const dateRef = useRef(date)
  const workoutTypeRef = useRef(workoutType)
  dateRef.current = date
  workoutTypeRef.current = workoutType

  const connect = useCallback(() => {
    if (unmounted.current || !enabled) return

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`)
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
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, MAX_RECONNECT_DELAY_MS)
        connect()
      }, reconnectDelay.current)
    }
  }, [enabled, username])

  // Open/close connection when enabled changes
  useEffect(() => {
    unmounted.current = false
    if (enabled) {
      connect()
    } else {
      setOrder(planOrder)
      setWsStatus('closed')
    }
    return () => {
      unmounted.current = true
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
      wsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, connect])

  // When scope changes, fetch REST seed to get server's current order
  useEffect(() => {
    if (!enabled) return
    fetch('/api/live-order', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: { order: string[]; version: number; scopeDate: string | null; scopeWorkout: string | null } | null) => {
        if (!data) return
        if (data.scopeDate === date && data.scopeWorkout === workoutType) {
          versionRef.current = data.version
          setOrder(data.order)
        } else {
          // Different scope — server will reset on next reorder from us
          versionRef.current = 0
          setOrder(planOrder)
        }
      })
      .catch(() => {/* stay on last-known order */})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, workoutType, enabled])

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

  return { order, reorder, wsStatus, partnerPresence, sendPresence }
}
