import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useEinkMode } from '../store/einkMode'
import { playTimerEnd } from '../lib/sounds'

// Shared countdown engine + overlay, extracted from the three near-identical
// timers that used to live inline (RestTimer, ExerciseTimer in WorkoutView and
// StretchTimer in StretchView). Each re-implemented the same tick loop, the same
// audio-ding + vibrate on reaching zero, and (Rest/Exercise) the same ring/±15
// overlay. `useCountdown` owns the loop + ding; `<CountdownTimer>` renders the
// overlay chrome for the two that need it. StretchView uses only the hook.

interface UseCountdownOpts {
  seconds: number
  // Rest/Exercise start immediately; Stretch waits for the user to press start.
  autoStart?: boolean
  // Exercise grows/shrinks its total when adjusted (so the ring re-scales);
  // Rest keeps the ring denominator fixed and only shifts the remaining time.
  adjustAffectsTotal?: boolean
  audioCtx: AudioContext | null
  muted: boolean
  // Exercise can lazily create an AudioContext on first gesture if none exists yet.
  resolveAudioCtx?: () => AudioContext
  // Called once when the countdown naturally reaches zero, with the full total.
  onComplete?: (achievedSecs: number) => void
}

export interface Countdown {
  total: number
  remaining: number
  running: boolean
  start: () => void
  toggle: () => void
  adjust: (delta: number) => void
  // Seconds actually elapsed so far (for logging an early finish). Min 1.
  achieved: () => number
  // Stop without firing the natural-completion ding (used by an early "Done").
  stop: () => void
}

export function useCountdown(opts: UseCountdownOpts): Countdown {
  const { seconds, autoStart = false, adjustAffectsTotal = false, audioCtx, muted, resolveAudioCtx, onComplete } = opts
  const [total, setTotal] = useState(seconds)
  const [remaining, setRemaining] = useState(seconds)
  const [running, setRunning] = useState(autoStart)
  const remainingRef = useRef(seconds)
  const totalRef = useRef(seconds)
  const firedRef = useRef(false)
  // Wall-clock deadline (ms epoch) for the running countdown. Browsers throttle
  // or suspend setInterval in background tabs, so ticks can't be counted —
  // remaining is always derived from this deadline instead.
  const endAtRef = useRef(0)

  // Keep the latest ding inputs/callback without re-subscribing the interval.
  const dingRef = useRef<{ audioCtx: AudioContext | null; muted: boolean; resolveAudioCtx?: () => AudioContext; onComplete?: (n: number) => void }>({
    audioCtx, muted, resolveAudioCtx, onComplete,
  })
  dingRef.current = { audioCtx, muted, resolveAudioCtx, onComplete }

  useEffect(() => {
    if (!running) return
    endAtRef.current = Date.now() + remainingRef.current * 1000
    const tick = () => {
      const next = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000))
      if (next !== remainingRef.current) {
        remainingRef.current = next
        setRemaining(next)
      }
      if (next <= 0) {
        clearInterval(id)
        setRunning(false)
        if (!firedRef.current) {
          firedRef.current = true
          const { audioCtx: ctx, muted: m, resolveAudioCtx: resolve, onComplete: done } = dingRef.current
          if (!m) {
            const resolved = ctx ?? resolve?.() ?? null
            if (resolved) playTimerEnd(resolved)
          }
          if (navigator.vibrate) navigator.vibrate([200, 100, 200])
          done?.(totalRef.current)
        }
      }
    }
    const id = setInterval(tick, 250)
    // Resync the moment the tab becomes visible again — throttled intervals mean
    // a backgrounded countdown may be long past its deadline when the user returns.
    const onVisibilityChange = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [running])

  // Track a changing `seconds` prop (e.g. StretchView swaps the hold length when
  // the user changes level) so a later start() counts the new duration. While a
  // countdown is running we leave the in-flight remaining untouched.
  useEffect(() => {
    totalRef.current = seconds
    setTotal(seconds)
    if (!running) {
      remainingRef.current = seconds
      setRemaining(seconds)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds])

  const start = useCallback(() => {
    remainingRef.current = totalRef.current
    endAtRef.current = Date.now() + totalRef.current * 1000
    setRemaining(totalRef.current)
    firedRef.current = false
    setRunning(true)
  }, [])

  const toggle = useCallback(() => setRunning(r => !r), [])

  const adjust = useCallback((delta: number) => {
    const floor = adjustAffectsTotal ? 1 : 5
    const nextRemaining = Math.max(floor, remainingRef.current + delta)
    endAtRef.current += (nextRemaining - remainingRef.current) * 1000
    remainingRef.current = nextRemaining
    setRemaining(nextRemaining)
    if (adjustAffectsTotal) {
      const nextTotal = Math.max(5, totalRef.current + delta)
      totalRef.current = nextTotal
      setTotal(nextTotal)
    }
  }, [adjustAffectsTotal])

  const achieved = useCallback(() => Math.max(1, totalRef.current - Math.max(0, remainingRef.current)), [])

  const stop = useCallback(() => {
    firedRef.current = true
    setRunning(false)
  }, [])

  return { total, remaining, running, start, toggle, adjust, achieved, stop }
}

// ── Overlay presentation (Rest + Exercise) ────────────────────────────────────

function fmt(secs: number): string {
  const mins = Math.floor(Math.abs(secs) / 60)
  const rest = Math.abs(secs) % 60
  return `${mins}:${rest.toString().padStart(2, '0')}`
}

interface CountdownTimerProps {
  seconds: number
  title: string          // e.g. "Rest" / "Hold"
  doneTitle: string      // e.g. "Rest done!" / "Done!"
  ariaLabel: string
  adjustAffectsTotal?: boolean
  audioCtx: AudioContext | null
  muted: boolean
  resolveAudioCtx?: () => AudioContext
  onComplete?: (achievedSecs: number) => void
  cardClass?: string     // extra class on the card (exercise-timer-card)
  ringClass?: string     // extra class on the ring svg
  timeClass?: string     // extra class on the time readout
  // Footer buttons differ (Rest: skip; Exercise: cancel/done), so callers supply them.
  renderFooter: (timer: Countdown) => ReactNode
}

// The shared overlay chrome: dimmed dialog, optional SVG progress ring, big time
// readout, and the ±15s / pause row. Callers render their own footer buttons.
export default function CountdownTimer(props: CountdownTimerProps) {
  const { einkMode } = useEinkMode()
  const timer = useCountdown({
    seconds: props.seconds,
    autoStart: true,
    adjustAffectsTotal: props.adjustAffectsTotal,
    audioCtx: props.audioCtx,
    muted: props.muted,
    resolveAudioCtx: props.resolveAudioCtx,
    onComplete: props.onComplete,
  })
  const { remaining, total, running } = timer
  const done = remaining <= 0
  const pct = Math.max(0, remaining / total)
  const mins = Math.floor(Math.abs(remaining) / 60)
  const secsPart = Math.abs(remaining) % 60

  return (
    <div className="rest-timer-overlay" role="dialog" aria-label={props.ariaLabel} aria-live="polite">
      <div className={`rest-timer-card${props.cardClass ? ' ' + props.cardClass : ''}`}>
        <div className="rest-timer-label">{done ? props.doneTitle : props.title}</div>
        {!einkMode && (
          <svg viewBox="0 0 80 80" className={`rest-timer-ring${props.ringClass ? ' ' + props.ringClass : ''}`} aria-hidden="true">
            <circle cx="40" cy="40" r="34" fill="none" stroke="var(--surface2)" strokeWidth="6"/>
            <circle
              cx="40" cy="40" r="34"
              fill="none"
              stroke={done ? 'var(--green)' : 'var(--accent)'}
              strokeWidth="6"
              strokeDasharray={`${2 * Math.PI * 34}`}
              strokeDashoffset={`${2 * Math.PI * 34 * (1 - pct)}`}
              strokeLinecap="round"
              transform="rotate(-90 40 40)"
              style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
            />
          </svg>
        )}
        <div className={`rest-timer-time${props.timeClass ? ' ' + props.timeClass : ''}`} aria-label={`${mins} minutes ${secsPart} seconds remaining`}>
          {fmt(remaining)}
        </div>
        <div className="rest-timer-adj">
          <button className="btn btn-secondary btn-sm" onClick={() => timer.adjust(-15)} aria-label="Subtract 15 seconds">-15s</button>
          <button className="btn btn-secondary btn-sm" onClick={timer.toggle} aria-label={running ? 'Pause timer' : 'Resume timer'}>
            {running ? 'Pause' : 'Resume'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => timer.adjust(15)} aria-label="Add 15 seconds">+15s</button>
        </div>
        {props.renderFooter(timer)}
      </div>
    </div>
  )
}
