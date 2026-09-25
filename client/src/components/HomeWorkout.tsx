import { useState } from 'react'
import { useStore } from '../store/store'
import { useWakeLock } from '../lib/audioUnlock'
import { useCountdown } from './CountdownTimer'
import { dateKey, homeWorkoutSteps, homeWorkoutMinutes, HOME_WORKOUT } from '@letsgetbuff/shared'
import type { HomeStep, StretchLevelId } from '@letsgetbuff/shared'

// Guided player for the bodyweight home circuit (issue #1). Full-screen
// overlay in the v2 focus style: one timed step at a time (warm-up →
// work/rest rounds), auto-advancing on each countdown's ding. Since v52 the
// circuit runs at the variant levels chosen on the overview, and finishing
// asks one question — "felt easy?" — which drives the harder-variant
// suggestion (engine/homeProgression.ts). Logging happens on the finish
// screen's button, recording the levels actually used.

function fmt(secs: number): string {
  const m = Math.floor(Math.max(0, secs) / 60)
  const s = Math.max(0, secs) % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function stepColor(kind: HomeStep['kind']): string {
  switch (kind) {
    case 'warmup': return 'var(--blue)'
    case 'work': return 'var(--accent)'
    case 'rest': return 'var(--green)'
  }
}

// Remounted per step (key={idx}) so autoStart restarts the shared countdown
// engine cleanly for each interval.
function StepTimer({ seconds, audioCtx, muted, onComplete }: {
  seconds: number; audioCtx: AudioContext | null; muted: boolean; onComplete: () => void
}) {
  const timer = useCountdown({ seconds, autoStart: true, audioCtx, muted, onComplete })
  return (
    <div className="col" style={{ alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 56, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
        {fmt(timer.remaining)}
      </span>
      <button className="btn btn-secondary btn-sm" onClick={timer.toggle} aria-label={timer.running ? 'Pause timer' : 'Resume timer'}>
        {timer.running ? 'Pause' : 'Resume'}
      </button>
    </div>
  )
}

export default function HomeWorkout({ audioCtx, muted, levels, onClose }: {
  audioCtx: AudioContext | null; muted: boolean
  /** Variant level per exercise id — chosen on the overview (suggested or overridden). */
  levels: Record<string, StretchLevelId>
  onClose: () => void
}) {
  const { dispatch } = useStore()
  useWakeLock(true) // keep the screen on mid-circuit (iOS locks kill the timers)
  const steps = homeWorkoutSteps(HOME_WORKOUT, ex => levels[ex.id] ?? 1)
  const [idx, setIdx] = useState(0)
  const [finished, setFinished] = useState(false)
  const [feltEasy, setFeltEasy] = useState(false)
  const step = steps[idx]
  const nextWork = steps.slice(idx + 1).find(s => s.kind === 'work')

  const advance = () => {
    if (idx + 1 < steps.length) setIdx(idx + 1)
    else setFinished(true)
  }

  const logAndClose = () => {
    dispatch({
      type: 'ADD_ACTIVITY',
      date: dateKey(new Date()),
      activity: { type: 'home', minutes: homeWorkoutMinutes(), levels, feltEasy },
    })
    onClose()
  }

  if (finished) {
    return (
      <div className="focus-overlay ui-v2 v2-focus" role="dialog" aria-label="Home workout" aria-modal="true">
        <div className="v2-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <span style={{ fontSize: 40 }}>💪</span>
          <h2 style={{ margin: 0 }}>Circuit done!</h2>
          <span className="muted">{HOME_WORKOUT.name} · ~{homeWorkoutMinutes()} min, logged for today.</span>
          <label className="row gap-8" style={{ alignItems: 'center', fontSize: 14, marginTop: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={feltEasy} onChange={e => setFeltEasy(e.target.checked)} />
            Felt easy — two easy circuits in a row suggest harder variants
          </label>
        </div>
        <div className="v2-nav">
          <button className="v2-nav-btn v2-nav-ready" style={{ flex: 1 }} onClick={logAndClose}>Log &amp; close ✓</button>
        </div>
      </div>
    )
  }

  return (
    <div className="focus-overlay ui-v2 v2-focus" role="dialog" aria-label="Home workout" aria-modal="true">
      <div className="v2-header">
        <button className="v2-header-btn" onClick={onClose} aria-label="Exit home workout">Exit</button>
        <span className="v2-counter">
          {step.kind === 'warmup'
            ? 'Get moving'
            : `Round ${step.round}/${HOME_WORKOUT.rounds}${step.kind === 'work' ? ` · ${step.exerciseIndex + 1}/${HOME_WORKOUT.exercises.length}` : ''}`}
        </span>
        <div className="v2-progress" aria-hidden="true">
          <div className="v2-progress-fill" style={{ width: `${((idx + 1) / steps.length) * 100}%` }} />
        </div>
      </div>
      <div className="v2-body" style={{ textAlign: 'center' }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: stepColor(step.kind), marginBottom: 4 }}>
            {step.kind === 'work' ? 'Work' : step.name}
          </div>
          <div className="v2-ex-name" style={{ marginBottom: 12 }}>
            {step.kind === 'rest' ? (nextWork ? `Next: ${nextWork.name}` : 'Rest') : step.name}
          </div>
          <StepTimer key={idx} seconds={step.seconds} audioCtx={audioCtx} muted={muted} onComplete={advance} />
          {step.cues.length > 0 && (
            <ul className="muted" style={{ fontSize: 13, margin: '14px auto 0', paddingLeft: 18, maxWidth: 320, textAlign: 'left' }}>
              {step.cues.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          )}
        </div>
      </div>
      <div className="v2-nav">
        <button className="v2-nav-btn" style={{ flex: 1 }} disabled={idx === 0} onClick={() => setIdx(i => Math.max(0, i - 1))}>Prev</button>
        <button className="v2-nav-btn v2-nav-ready" style={{ flex: 2 }} onClick={advance}>
          {idx + 1 < steps.length ? 'Skip →' : 'Finish ✓'}
        </button>
      </div>
    </div>
  )
}
