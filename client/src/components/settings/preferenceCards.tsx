import { useState, useEffect } from 'react'
import { useTestMode } from '../../store/testMode'
import { TIMER_SOUNDS, getTimerSound, setTimerSound, playTimerEnd, preloadTimerSounds, type TimerSound } from '../../lib/sounds'

const REST_SECS_KEY = 'letsgetbuff-rest-secs'
const REST_SECS_DEFAULT = 90
const REST_SECS_OPTIONS = [
  { value: 60,  label: '1 min' },
  { value: 90,  label: '90 sec' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
]

// ── Rest timer preference card ────────────────────────────────────────────────

export function RestTimerCard() {
  const [secs, setSecs] = useState(() => {
    const saved = localStorage.getItem(REST_SECS_KEY)
    return saved ? Number(saved) : REST_SECS_DEFAULT
  })

  const change = (val: number) => {
    setSecs(val)
    localStorage.setItem(REST_SECS_KEY, String(val))
  }

  return (
    <div className="card mb-12">
      <div className="card-title">Rest timer default</div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
        Duration shown after each completed set (except the last). You can still adjust ±15s on the fly during a workout.
        Until you pick a value the default is 90 sec, rising to 2½ min from week 17 (heavier 4×6 sets).
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Rest timer duration">
        {REST_SECS_OPTIONS.map(opt => (
          <button
            key={opt.value}
            className={`btn btn-sm ${secs === opt.value ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => change(opt.value)}
            aria-pressed={secs === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Timer sound preference ──────────────────────────────────────────────────────

export function TimerSoundCard() {
  const [sound, setSound] = useState<TimerSound>(() => getTimerSound())

  // Warm the recordings so previews play without a load hiccup.
  useEffect(() => { preloadTimerSounds() }, [])

  const preview = (s: TimerSound) => {
    if (s === 'shout') { playTimerEnd(null as unknown as AudioContext, s); return }  // uses speech synthesis
    const Ctor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    playTimerEnd(ctx, s)
    setTimeout(() => ctx.close().catch(() => {}), 2500)
  }

  const choose = (s: TimerSound) => {
    setSound(s)
    setTimerSound(s)
    preview(s)  // play it so the choice is audible immediately
  }

  return (
    <div className="card mb-12">
      <div className="card-title">Timer sound</div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
        Played when a rest or exercise timer runs out. Tap one to hear it.
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Timer sound">
        {TIMER_SOUNDS.map(opt => (
          <button
            key={opt.value}
            className={`btn btn-sm ${sound === opt.value ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => choose(opt.value)}
            aria-pressed={sound === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Test mode toggle (all users, frontend-only) ────────────────────────────────

export function TestModeCard() {
  const { testMode, setTestMode } = useTestMode()
  return (
    <div className="card mb-12" style={testMode ? { borderColor: 'var(--accent)' } : undefined}>
      <div className="card-title">🧪 Test mode</div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
        Try workouts, sets and timers freely — nothing is saved to your log or the server.
        Turn it off to return to your real data. This setting is only on this device.
      </p>
      <button
        className={`btn btn-sm ${testMode ? 'btn-primary' : 'btn-secondary'}`}
        onClick={() => setTestMode(!testMode)}
        aria-pressed={testMode}
      >
        {testMode ? 'Test mode: On' : 'Test mode: Off'}
      </button>
    </div>
  )
}

// The stretch schedule toggle was removed with the fixed Mon/Wed/Fri stretch
// days (schema v4): stretching is now a user-added activity like runs and
// rides. AppState.stretchSchedule stays in the shape so old backups round-trip.
