import { useState } from 'react'
import { useStore } from '../store/store'
import { useCountdown } from './CountdownTimer'
import { dateKey, homeWorkoutSteps, homeWorkoutMinutes, HOME_WORKOUT } from '@letsgetbuff/shared'
import type { HomeStep } from '@letsgetbuff/shared'

// Guided player for the bodyweight home circuit (issue #1). Full-screen
// overlay in the style of StretchFocus: one timed step at a time (warm-up →
// work/rest rounds), auto-advancing on each countdown's ding. Finishing logs
// a `home` ActivityEntry on today — the gym calendar is untouched.

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

export default function HomeWorkout({ audioCtx, muted, onClose }: {
  audioCtx: AudioContext | null; muted: boolean; onClose: () => void
}) {
  const { dispatch } = useStore()
  const steps = homeWorkoutSteps()
  const [idx, setIdx] = useState(0)
  const [finished, setFinished] = useState(false)
  const step = steps[idx]
  const nextWork = steps.slice(idx + 1).find(s => s.kind === 'work')

  const advance = () => {
    if (idx + 1 < steps.length) {
      setIdx(idx + 1)
    } else {
      dispatch({
        type: 'ADD_ACTIVITY',
        date: dateKey(new Date()),
        activity: { type: 'home', minutes: homeWorkoutMinutes() },
      })
      setFinished(true)
    }
  }

  if (finished) {
    return (
      <div className="focus-overlay" role="dialog" aria-label="Home workout" aria-modal="true">
        <div className="focus-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{ fontSize: 40 }}>💪</span>
          <h2 style={{ margin: 0 }}>Workout done!</h2>
          <span className="muted">{HOME_WORKOUT.name} · ~{homeWorkoutMinutes()} min logged for today.</span>
        </div>
        <div className="focus-nav">
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={onClose}>Close</button>
        </div>
      </div>
    )
  }

  return (
    <div className="focus-overlay" role="dialog" aria-label="Home workout" aria-modal="true">
      <div className="focus-header">
        <button className="btn btn-secondary btn-sm" onClick={onClose} aria-label="Exit home workout">Exit</button>
        <span className="muted" style={{ fontSize: 13 }}>
          {step.kind === 'warmup'
            ? 'Get moving'
            : `Round ${step.round}/${HOME_WORKOUT.rounds}${step.kind === 'work' ? ` · ${step.exerciseIndex + 1}/${HOME_WORKOUT.exercises.length}` : ''}`}
        </span>
        <div className="focus-progress-bar" aria-hidden="true">
          <div className="focus-progress-fill" style={{ width: `${((idx + 1) / steps.length) * 100}%` }} />
        </div>
      </div>
      <div className="focus-body" style={{ textAlign: 'center' }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: stepColor(step.kind), marginBottom: 4 }}>
            {step.kind === 'work' ? 'Work' : step.name}
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>
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
      <div className="focus-nav">
        <button className="btn btn-secondary" style={{ flex: 1 }} disabled={idx === 0} onClick={() => setIdx(i => Math.max(0, i - 1))}>Prev</button>
        <button className="btn btn-primary" style={{ flex: 2 }} onClick={advance}>
          {idx + 1 < steps.length ? 'Skip →' : 'Finish ✓'}
        </button>
      </div>
    </div>
  )
}
