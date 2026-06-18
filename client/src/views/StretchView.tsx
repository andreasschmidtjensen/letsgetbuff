import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/store'
import { useEinkMode } from '../store/einkMode'
import StretchAnimation from '../components/StretchAnimation'
import { playTimerEnd, preloadTimerSounds } from '../lib/sounds'
import { dateKey, keyToDate } from '../lib/date'
import {
  computeProgramWeek, isStretchDay, todayDayName,
  getSessionStretches, getStretchLevel, suggestStretchLevel,
} from '@letsgetbuff/shared'
import type { StretchDef, StretchLevelId, StretchEntry, SetEntry } from '@letsgetbuff/shared'

const MUTE_KEY = 'letsgetbuff-mute'
const SESSION_ID = 'daily'

function fmt(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = Math.max(0, secs) % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function timingSecs(lvl: { holdSeconds?: number; durationSeconds?: number }): number {
  return lvl.holdSeconds ?? lvl.durationSeconds ?? 30
}

// ── Countdown timer (hold or flow) ───────────────────────────────────────────

function StretchTimer({ seconds, label, onComplete, audioCtx, muted }: {
  seconds: number; label: string; onComplete: () => void
  audioCtx: AudioContext | null; muted: boolean
}) {
  const [remaining, setRemaining] = useState(seconds)
  const [running, setRunning] = useState(false)
  const ref = useRef(seconds)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      ref.current -= 1
      setRemaining(ref.current)
      if (ref.current <= 0) {
        clearInterval(id)
        setRunning(false)
        if (audioCtx && !muted) playTimerEnd(audioCtx)
        if (navigator.vibrate) navigator.vibrate([200, 100, 200])
        onComplete()
      }
    }, 1000)
    return () => clearInterval(id)
  }, [running]) // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => { ref.current = seconds; setRemaining(seconds); setRunning(true) }

  return (
    <div className="row gap-8" style={{ alignItems: 'center' }}>
      {running ? (
        <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(remaining)}</span>
      ) : (
        <button className="btn btn-primary btn-sm" onClick={start} aria-label={`Start ${label} timer`}>
          ▶ {label} {fmt(seconds)}
        </button>
      )}
    </div>
  )
}

// ── One stretch card ─────────────────────────────────────────────────────────

function StretchCard({ stretch, dateStr, audioCtx, muted, focus }: {
  stretch: StretchDef; dateStr: string; audioCtx: AudioContext | null; muted: boolean; focus?: boolean
}) {
  const { state, dispatch } = useStore()
  const suggested = suggestStretchLevel(state, stretch.id, stretch.startLevel)
  const [override, setOverride] = useState<StretchLevelId | null>(null)
  const level: StretchLevelId = override ?? suggested
  const lvl = getStretchLevel(stretch, level)

  const needed = stretch.perSide ? 2 : 1
  const [sidesDone, setSidesDone] = useState(0)
  const [feltEasy, setFeltEasy] = useState(false)

  const priorEntry = (() => {
    for (const d of Object.keys(state.stretchSessions)) {
      const e = state.stretchSessions[d].entries[stretch.id]
      if (e && e.level === level) return true
    }
    return false
  })()
  const [showVideo, setShowVideo] = useState(!priorEntry)

  const logged = Boolean(state.stretchSessions[dateStr]?.entries[stretch.id])
  const secs = timingSecs(lvl)
  const sideLabel = needed === 2 ? (sidesDone === 0 ? 'Side 1' : 'Side 2') : 'Hold'

  const onSideDone = () => {
    const next = sidesDone + 1
    setSidesDone(next)
    if (next >= needed) {
      const holds: SetEntry[] = Array.from({ length: needed }, () => ({ seconds: secs }))
      const entry: StretchEntry = { holds, level, feltEasy }
      dispatch({ type: 'LOG_STRETCH', date: dateStr, sessionId: SESSION_ID, stretchId: stretch.id, entry })
    }
  }

  const changeLevel = (delta: number) => {
    const n = Math.min(3, Math.max(1, level + delta)) as StretchLevelId
    setOverride(n)
    setSidesDone(0)
  }

  return (
    <div className={`card mb-8${logged ? ' exercise-done' : ''}`} style={focus ? { padding: 16 } : undefined}>
      <div className="row gap-8" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="exercise-name" style={{ fontSize: focus ? 18 : 15 }}>{stretch.name}</span>
        {logged && <span className="badge badge-green">logged</span>}
      </div>
      <div className="row gap-8" style={{ alignItems: 'center', margin: '4px 0 8px' }}>
        <span className="muted" style={{ fontSize: 12 }}>{stretch.kind === 'flow' ? 'Flow' : 'Hold'} · {lvl.name}</span>
        <div className="row gap-4" style={{ marginLeft: 'auto', alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => changeLevel(-1)} disabled={level <= 1} aria-label="Easier level">↓</button>
          <span style={{ fontSize: 12 }}>Level {level}/3</span>
          <button className="btn btn-secondary btn-sm" onClick={() => changeLevel(1)} disabled={level >= 3} aria-label="Harder level">↑</button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
        <StretchAnimation frames={lvl.frames} view={lvl.view} size={focus ? 180 : 130} />
      </div>

      {showVideo ? (
        <div className="mb-8">
          {lvl.videoUrls.map((u, i) => (
            <a key={i} className="video-link" href={u} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginRight: 8 }}>▶ Video {lvl.videoUrls.length > 1 ? i + 1 : ''}</a>
          ))}
          {priorEntry && (
            <button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={() => setShowVideo(false)}>Hide video</button>
          )}
          {!priorEntry && <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>Watch once, then follow the animation.</span>}
        </div>
      ) : (
        <button className="btn btn-secondary btn-sm mb-8" onClick={() => setShowVideo(true)}>▶ Watch video</button>
      )}

      <ul className="muted" style={{ fontSize: 13, margin: '0 0 10px', paddingLeft: 18 }}>
        {lvl.cues.map((c, i) => <li key={i}>{c}</li>)}
      </ul>

      <div className="row gap-8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        {sidesDone < needed ? (
          <StretchTimer seconds={secs} label={sideLabel} onComplete={onSideDone} audioCtx={audioCtx} muted={muted} />
        ) : (
          <span className="badge badge-green">done ✓</span>
        )}
        <label className="row gap-4" style={{ alignItems: 'center', fontSize: 13, marginLeft: 'auto' }}>
          <input type="checkbox" checked={feltEasy} onChange={e => setFeltEasy(e.target.checked)} />
          Felt easy
        </label>
      </div>
      {stretch.safetyCues.length > 0 && (
        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
          ⚠ {stretch.safetyCues.map(c => c === 'knee' ? 'mind the knee' : 'keep the back safe').join(' · ')}
        </div>
      )}
    </div>
  )
}

// ── Focus mode ───────────────────────────────────────────────────────────────

function StretchFocus({ stretches, startIndex, dateStr, audioCtx, muted, onClose }: {
  stretches: StretchDef[]; startIndex: number; dateStr: string
  audioCtx: AudioContext | null; muted: boolean; onClose: (finished: boolean) => void
}) {
  const [idx, setIdx] = useState(startIndex)
  const cur = stretches[idx]
  const isLast = idx >= stretches.length - 1
  const prevKind = idx > 0 ? stretches[idx - 1].kind : null
  const dividerHere = prevKind === 'flow' && cur.kind === 'hold'

  return (
    <div className="focus-overlay" role="dialog" aria-label="Stretch focus mode" aria-modal="true">
      <div className="focus-header">
        <button className="btn btn-secondary btn-sm" onClick={() => onClose(false)} aria-label="Exit focus mode">Overview</button>
        <span className="muted" style={{ fontSize: 13 }}>{cur.kind === 'flow' ? 'Flow' : 'Static holds'} · {idx + 1} / {stretches.length}</span>
        <div className="focus-progress-bar" aria-hidden="true">
          <div className="focus-progress-fill" style={{ width: `${((idx + 1) / stretches.length) * 100}%` }} />
        </div>
      </div>
      <div className="focus-body">
        {dividerHere && (
          <div className="card mb-8" role="note" style={{ borderColor: 'var(--accent)' }}>
            <strong>Now the static holds</strong>
            <div className="muted" style={{ fontSize: 12 }}>You're warm — ease into the longer holds.</div>
          </div>
        )}
        <StretchCard key={`${dateStr}-${cur.id}`} stretch={cur} dateStr={dateStr} audioCtx={audioCtx} muted={muted} focus />
      </div>
      <div className="focus-nav">
        <button className="btn btn-secondary" style={{ flex: 1 }} disabled={idx === 0} onClick={() => setIdx(i => i - 1)}>Prev</button>
        {!isLast ? (
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => setIdx(i => i + 1)}>Next →</button>
        ) : (
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => onClose(true)}>Finish ✓</button>
        )}
      </div>
    </div>
  )
}

// ── View ─────────────────────────────────────────────────────────────────────

export default function StretchView() {
  const { state, dispatch } = useStore()
  useEinkMode()
  const today = new Date()
  const todayStr = dateKey(today)
  const [dateStr, setDateStr] = useState(todayStr)
  const [focusIndex, setFocusIndex] = useState<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTE_KEY) === '1')

  useEffect(() => { preloadTimerSounds() }, [])

  const initAudio = () => {
    if (!audioCtxRef.current) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctor) audioCtxRef.current = new Ctor()
    }
    return audioCtxRef.current
  }

  const stretches = getSessionStretches(SESSION_ID)
  const flows = stretches.filter(s => s.kind === 'flow')
  const holds = stretches.filter(s => s.kind === 'hold')
  const session = state.stretchSessions[dateStr]

  const programWeek = state.startDate ? computeProgramWeek(state.startDate, state.skippedWeeks, keyToDate(dateStr)) : 1
  const scheduledToday = isStretchDay(programWeek, todayDayName(keyToDate(dateStr)), state.stretchSchedule.enabled)

  const toggleMute = () => setMuted(m => { const n = !m; localStorage.setItem(MUTE_KEY, n ? '1' : '0'); return n })

  return (
    <div>
      {focusIndex !== null && (
        <StretchFocus
          stretches={stretches}
          startIndex={focusIndex}
          dateStr={dateStr}
          audioCtx={initAudio()}
          muted={muted}
          onClose={(finished) => {
            if (finished) dispatch({ type: 'MARK_STRETCH_DONE', date: dateStr, sessionId: SESSION_ID })
            setFocusIndex(null)
          }}
        />
      )}

      <div className="row gap-8 mb-8" style={{ flexWrap: 'wrap', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0 }}>Stretch</h2>
        {session?.done && <span className="badge badge-green">Done</span>}
        <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
          {muted ? '🔇' : '🔔'}
        </button>
      </div>

      <div className="card mb-12">
        <input type="date" className="input mb-8" value={dateStr} max={todayStr} onChange={e => setDateStr(e.target.value)} aria-label="Stretch date" />
        <div className="muted" style={{ fontSize: 13 }}>
          {scheduledToday
            ? 'Scheduled stretch day — flow first, then the static holds.'
            : 'Not a scheduled stretch day, but you can stretch any time.'}
        </div>
      </div>

      <button className="btn btn-primary btn-start-focus mb-12" onClick={() => { initAudio(); setFocusIndex(0) }} aria-label="Start stretch focus">
        ▶ Start session (flow → holds)
      </button>

      <h3 style={{ margin: '4px 0 8px' }}>Flow</h3>
      {flows.map(s => <StretchCard key={s.id} stretch={s} dateStr={dateStr} audioCtx={audioCtxRef.current} muted={muted} />)}

      <h3 style={{ margin: '12px 0 8px' }}>Static holds</h3>
      {holds.map(s => <StretchCard key={s.id} stretch={s} dateStr={dateStr} audioCtx={audioCtxRef.current} muted={muted} />)}

      <div style={{ marginTop: 16 }}>
        {session?.done ? (
          <button className="btn btn-secondary w-full" onClick={() => dispatch({ type: 'UNMARK_STRETCH_DONE', date: dateStr })}>Undo completion</button>
        ) : (
          <button className="btn btn-primary w-full" onClick={() => dispatch({ type: 'MARK_STRETCH_DONE', date: dateStr, sessionId: SESSION_ID })}>Mark stretching done</button>
        )}
      </div>
    </div>
  )
}
