import { useCallback, useEffect, useRef, useState } from 'react'
import { playTimerEnd } from '../../../lib/sounds'

/**
 * The two-lane rest engine. One lane per person resting, or a single merged
 * lane when you rest together.
 *
 * Like `useCountdown`, every lane is a wall-clock deadline (`endAt`) — never a
 * tick count. Background tabs throttle intervals, so remaining time is always
 * derived from the deadline and resynced on `visibilitychange`. Lanes are
 * mirrored into localStorage so a reload mid-rest restores both countdowns with
 * the right time left.
 */

export const REST_LANES_KEY = 'letsgetbuff-rest-lanes'

/** Key of the merged lane used in `together` mode. */
export const TOGETHER_KEY = '__together__'

/** A finished lane keeps showing GO; drop one only once it is long stale. */
const STALE_AFTER_MS = 30 * 60 * 1000

interface Lane {
  names: string[]
  total: number
  endAt: number
  /** Seconds left at the moment of pausing; null while running. */
  pausedRemaining: number | null
}

export interface LaneView {
  key: string
  names: string[]
  total: number
  remaining: number
  paused: boolean
  done: boolean
  /** 0-1, for the progress track. A finished lane reads 1. */
  progress: number
}

type LaneMap = Record<string, Lane>

function readStored(): LaneMap {
  try {
    const raw = localStorage.getItem(REST_LANES_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (!parsed || typeof parsed !== 'object') return {}
    const now = Date.now()
    const out: LaneMap = {}
    for (const [key, lane] of Object.entries(parsed as LaneMap)) {
      if (!lane || typeof lane.endAt !== 'number' || typeof lane.total !== 'number') continue
      if (lane.pausedRemaining === null && now - lane.endAt > STALE_AFTER_MS) continue
      out[key] = { names: lane.names ?? [], total: lane.total, endAt: lane.endAt, pausedRemaining: lane.pausedRemaining ?? null }
    }
    return out
  } catch {
    return {}
  }
}

function write(lanes: LaneMap): void {
  try {
    if (Object.keys(lanes).length === 0) localStorage.removeItem(REST_LANES_KEY)
    else localStorage.setItem(REST_LANES_KEY, JSON.stringify(lanes))
  } catch {
    // Storage blocked: the countdown still runs, it just won't survive a reload.
  }
}

function remainingOf(lane: Lane, now: number): number {
  if (lane.pausedRemaining !== null) return lane.pausedRemaining
  return Math.max(0, Math.ceil((lane.endAt - now) / 1000))
}

interface UseRestLanesOpts {
  muted: boolean
  audioCtx: AudioContext | null
  resolveAudioCtx?: () => AudioContext
}

export function useRestLanes({ muted, audioCtx, resolveAudioCtx }: UseRestLanesOpts) {
  const [lanes, setLanes] = useState<LaneMap>(() => readStored())
  const [, forceTick] = useState(0)
  // Lanes whose ding has already fired, so a re-render never re-rings.
  const firedRef = useRef<Set<string>>(new Set())
  const dingRef = useRef({ muted, audioCtx, resolveAudioCtx })
  dingRef.current = { muted, audioCtx, resolveAudioCtx }

  // Anything restored from storage that is already at zero has, by definition,
  // rung before the reload.
  useEffect(() => {
    const now = Date.now()
    for (const [key, lane] of Object.entries(lanes)) {
      if (remainingOf(lane, now) <= 0) firedRef.current.add(key)
    }
    // Mount only — later zero-crossings are handled by the tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const update = useCallback((fn: (prev: LaneMap) => LaneMap) => {
    setLanes(prev => {
      const next = fn(prev)
      write(next)
      return next
    })
  }, [])

  // One interval for every lane. Re-renders only when a displayed second moves.
  const lastRenderRef = useRef('')
  useEffect(() => {
    const tick = () => {
      const now = Date.now()
      const sig = Object.entries(lanes)
        .map(([k, l]) => `${k}:${remainingOf(l, now)}`)
        .join('|')

      for (const [key, lane] of Object.entries(lanes)) {
        if (remainingOf(lane, now) <= 0 && !firedRef.current.has(key)) {
          firedRef.current.add(key)
          const { muted: m, audioCtx: ctx, resolveAudioCtx: resolve } = dingRef.current
          if (!m) {
            const resolved = ctx ?? resolve?.() ?? null
            if (resolved) playTimerEnd(resolved)
          }
          if (navigator.vibrate) navigator.vibrate([200, 100, 200])
        }
      }

      if (sig !== lastRenderRef.current) {
        lastRenderRef.current = sig
        forceTick(n => n + 1)
      }
    }
    tick()
    if (Object.keys(lanes).length === 0) return
    const id = setInterval(tick, 250)
    // A backgrounded countdown may be long past its deadline on return.
    const onVisibility = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [lanes])

  /** Start (or restart) a lane at `secs`. */
  const start = useCallback((key: string, names: string[], secs: number) => {
    firedRef.current.delete(key)
    update(prev => ({ ...prev, [key]: { names, total: secs, endAt: Date.now() + secs * 1000, pausedRemaining: null } }))
  }, [update])

  /**
   * Together mode: a second person confirming inside an already-running shared
   * window JOINS it rather than restarting it — otherwise the first person's
   * rest silently grows every time the other logs.
   */
  const startOrJoin = useCallback((key: string, names: string[], secs: number) => {
    firedRef.current.delete(key)
    update(prev => {
      const existing = prev[key]
      const live = existing && remainingOf(existing, Date.now()) > 0
      if (live) {
        const merged = [...new Set([...existing.names, ...names])]
        return { ...prev, [key]: { ...existing, names: merged } }
      }
      return { ...prev, [key]: { names, total: secs, endAt: Date.now() + secs * 1000, pausedRemaining: null } }
    })
  }, [update])

  /** ±15s shifts the remaining time only, leaving the total (the track) alone. */
  const adjust = useCallback((key: string, delta: number) => {
    update(prev => {
      const lane = prev[key]
      if (!lane) return prev
      const now = Date.now()
      const next = Math.max(5, remainingOf(lane, now) + delta)
      if (delta > 0) firedRef.current.delete(key)
      return {
        ...prev,
        [key]: lane.pausedRemaining !== null
          ? { ...lane, pausedRemaining: next }
          : { ...lane, endAt: now + next * 1000 },
      }
    })
  }, [update])

  const togglePause = useCallback((key: string) => {
    update(prev => {
      const lane = prev[key]
      if (!lane) return prev
      const now = Date.now()
      if (lane.pausedRemaining !== null) {
        return { ...prev, [key]: { ...lane, endAt: now + lane.pausedRemaining * 1000, pausedRemaining: null } }
      }
      return { ...prev, [key]: { ...lane, pausedRemaining: remainingOf(lane, now) } }
    })
  }, [update])

  /** Skip / dismiss one lane. */
  const clear = useCallback((key: string) => {
    firedRef.current.delete(key)
    update(prev => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [update])

  const clearAll = useCallback(() => {
    firedRef.current.clear()
    update(() => ({}))
  }, [update])

  const now = Date.now()
  const views: LaneView[] = Object.entries(lanes).map(([key, lane]) => {
    const remaining = remainingOf(lane, now)
    return {
      key,
      names: lane.names,
      total: lane.total,
      remaining,
      paused: lane.pausedRemaining !== null,
      done: remaining <= 0,
      progress: lane.total > 0 ? Math.min(1, 1 - remaining / lane.total) : 1,
    }
  })

  return { lanes: views, start, startOrJoin, adjust, togglePause, clear, clearAll }
}
