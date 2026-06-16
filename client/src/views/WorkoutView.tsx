import { useRef, useState, useEffect, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import type { DraggableAttributes } from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useStore } from '../store/store'
import { useLiveOrder } from '../store/useLiveOrder'
import StartSessionModal from '../components/StartSessionModal'
import { computeProgramWeek, scheduleFor, todayDayName } from '@letsgetbuff/shared'
import { todayKey, keyToDate } from '../lib/date'
import { getWorkoutExercises, getWorkout, ExerciseDef } from '@letsgetbuff/shared'
import { suggestNextWeight, repTargetFor, repBandFor } from '@letsgetbuff/shared'
import { ExerciseEntry, SetEntry, Session } from '@letsgetbuff/shared'
import type { Privilege } from '@letsgetbuff/shared'

function beep(ctx: AudioContext, freq = 880, duration = 0.12, vol = 0.4) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.frequency.value = freq
  gain.gain.setValueAtTime(vol, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + duration)
}

function playDoneSound(ctx: AudioContext) {
  beep(ctx, 880, 0.1, 0.35)
  setTimeout(() => beep(ctx, 1100, 0.18, 0.3), 120)
}

interface RestTimerProps {
  defaultSecs: number
  onDismiss: () => void
  audioCtx: AudioContext | null
}

function RestTimer({ defaultSecs, onDismiss, audioCtx }: RestTimerProps) {
  const [secs, setSecs] = useState(defaultSecs)
  const [running, setRunning] = useState(true)
  const remaining = useRef(defaultSecs)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fire = useCallback(() => {
    if (audioCtx) {
      beep(audioCtx, 660, 0.08, 0.3)
      setTimeout(() => beep(audioCtx, 880, 0.15, 0.35), 100)
    }
    if (navigator.vibrate) navigator.vibrate([200, 100, 200])
  }, [audioCtx])

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = setInterval(() => {
      remaining.current -= 1
      setSecs(remaining.current)
      if (remaining.current <= 0) {
        clearInterval(intervalRef.current!)
        setRunning(false)
        fire()
      }
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running, fire])

  const adjust = (delta: number) => {
    const next = Math.max(5, remaining.current + delta)
    remaining.current = next
    setSecs(next)
  }

  const pct = Math.max(0, secs / defaultSecs)
  const mins = Math.floor(Math.abs(secs) / 60)
  const secsPart = Math.abs(secs) % 60
  const display = `${mins}:${secsPart.toString().padStart(2, '0')}`

  return (
    <div className="rest-timer-overlay" role="dialog" aria-label="Rest timer" aria-live="polite">
      <div className="rest-timer-card">
        <div className="rest-timer-label">{secs <= 0 ? 'Rest done!' : 'Rest'}</div>
        <svg viewBox="0 0 80 80" className="rest-timer-ring" aria-hidden="true">
          <circle cx="40" cy="40" r="34" fill="none" stroke="var(--surface2)" strokeWidth="6"/>
          <circle
            cx="40" cy="40" r="34"
            fill="none"
            stroke={secs <= 0 ? 'var(--green)' : 'var(--accent)'}
            strokeWidth="6"
            strokeDasharray={`${2 * Math.PI * 34}`}
            strokeDashoffset={`${2 * Math.PI * 34 * (1 - pct)}`}
            strokeLinecap="round"
            transform="rotate(-90 40 40)"
            style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
          />
        </svg>
        <div className="rest-timer-time" aria-label={`${mins} minutes ${secsPart} seconds remaining`}>
          {display}
        </div>
        <div className="rest-timer-adj">
          <button className="btn btn-secondary btn-sm" onClick={() => adjust(-15)} aria-label="Subtract 15 seconds">-15s</button>
          <button className="btn btn-secondary btn-sm" onClick={() => { setRunning(r => !r) }} aria-label={running ? 'Pause timer' : 'Resume timer'}>
            {running ? 'Pause' : 'Resume'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => adjust(15)} aria-label="Add 15 seconds">+15s</button>
        </div>
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={onDismiss}>
          {secs <= 0 ? 'Next set' : 'Skip rest'}
        </button>
      </div>
    </div>
  )
}

function VideoCarousel({ urls }: { urls: string[] }) {
  const [i, setI] = useState(0)
  const touchX = useRef<number | null>(null)
  if (urls.length === 0) return null
  if (urls.length === 1) {
    return <a className="video-link" href={urls[0]} target="_blank" rel="noopener noreferrer">Video</a>
  }
  const n = urls.length
  const go = (delta: number) => setI(prev => (prev + delta + n) % n)
  return (
    <div className="video-carousel" onTouchStart={e => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={e => {
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        if (Math.abs(dx) > 30) go(dx < 0 ? 1 : -1)
        touchX.current = null
      }}>
      <button className="vc-arrow" aria-label="Previous video" onClick={() => go(-1)}>‹</button>
      <a className="video-link" href={urls[i]} target="_blank" rel="noopener noreferrer">Video</a>
      <div className="vc-dots">
        {urls.map((_, idx) => (
          <button key={idx} className={`vc-dot${idx === i ? ' active' : ''}`}
            aria-label={`Video ${idx + 1}`} aria-current={idx === i} onClick={() => setI(idx)}>
            {idx + 1}
          </button>
        ))}
      </div>
      <button className="vc-arrow" aria-label="Next video" onClick={() => go(1)}>›</button>
    </div>
  )
}

function lastSessionBefore(
  state: ReturnType<typeof useStore>['state'],
  exerciseId: string,
  beforeDate: string
): { sets: SetEntry[]; feltEasy: boolean } | null {
  const dates = Object.keys(state.sessions).filter(d => d < beforeDate).sort().reverse()
  for (const date of dates) {
    const entry = state.sessions[date].entries[exerciseId]
    if (entry) return entry
  }
  return null
}

function formatSet(s: SetEntry, ex: ExerciseDef): string {
  const parts: string[] = []
  if (ex.requiresKg && s.kg !== undefined) parts.push(`${s.kg}kg`)
  if (s.reps !== undefined) parts.push(`x${s.reps}`)
  else if (s.seconds !== undefined) parts.push(`${s.seconds}s`)
  return parts.join(' ') || '-'
}

function deltaLabel(
  current: SetEntry,
  prev: SetEntry | undefined,
  ex: ExerciseDef
): { text: string; positive: boolean } | null {
  if (!prev) return null
  if (ex.requiresKg && current.kg !== undefined && prev.kg !== undefined) {
    const d = current.kg - prev.kg
    if (d === 0) return null
    return { text: `${d > 0 ? '+' : ''}${d}kg`, positive: d > 0 }
  }
  if (!ex.requiresKg && current.reps !== undefined && prev.reps !== undefined) {
    const d = current.reps - prev.reps
    if (d === 0) return null
    return { text: `${d > 0 ? '+' : ''}${d} reps`, positive: d > 0 }
  }
  return null
}

function DragHandle({ listeners, attributes }: {
  listeners?: Record<string, unknown>
  attributes?: DraggableAttributes
}) {
  return (
    <button
      className="drag-handle"
      aria-label="Drag to reorder exercise"
      title="Drag to reorder"
      style={{
        cursor: 'grab',
        background: 'none',
        border: 'none',
        padding: '4px 6px',
        color: 'var(--text-muted)',
        fontSize: 16,
        lineHeight: 1,
        touchAction: 'none',
        flexShrink: 0,
      }}
      {...listeners}
      {...attributes}
    >
      ⠿
    </button>
  )
}

interface ExerciseLoggerProps {
  exercise: ExerciseDef
  dateStr: string
  programWeek: number
  onStartFocus?: () => void
  audioCtx: AudioContext | null
  onAudioCtxInit: () => AudioContext
  dragHandleListeners?: Record<string, unknown>
  dragHandleAttributes?: DraggableAttributes
  partnerHere?: string
  readOnly?: boolean
}

function SortableExerciseLogger(props: ExerciseLoggerProps & { partnerHere?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.exercise.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <ExerciseLogger
        {...props}
        dragHandleListeners={listeners}
        dragHandleAttributes={attributes}
      />
    </div>
  )
}

function ExerciseLogger({ exercise, dateStr, programWeek, onStartFocus, audioCtx, onAudioCtxInit, dragHandleListeners, dragHandleAttributes, partnerHere, readOnly }: ExerciseLoggerProps) {
  const { state, dispatch } = useStore()
  const existing = state.sessions[dateStr]?.entries[exercise.id]
  const prev = lastSessionBefore(state, exercise.id, dateStr)

  const lastWeight = prev?.sets.find(s => s.kg !== undefined)?.kg
  const suggestion = suggestNextWeight(exercise.progressionType, lastWeight, prev?.feltEasy ?? false)
  const target = repTargetFor(exercise, programWeek)

  const makePrefill = (i: number): SetEntry => {
    if (existing?.sets[i]) return existing.sets[i]
    const s: SetEntry = {}
    if (suggestion !== null) s.kg = suggestion
    if (target.seconds) s.seconds = target.seconds
    else if (target.reps) s.reps = target.reps
    return s
  }

  const [sets, setSets] = useState<SetEntry[]>(
    Array.from({ length: target.sets }, (_, i) => makePrefill(i))
  )
  const [confirmed, setConfirmed] = useState<boolean[]>(
    Array.from({ length: target.sets }, (_, i) => !!(existing?.sets[i] && (existing.sets[i].reps !== undefined || existing.sets[i].seconds !== undefined)))
  )
  const [editing, setEditing] = useState<number | null>(null)
  const [feltEasy, setFeltEasy] = useState(existing?.feltEasy ?? false)
  const [expanded, setExpanded] = useState(false)
  const [showTimer, setShowTimer] = useState(false)
  const [restDefault] = useState(90)

  const saveEntry = (newSets: SetEntry[], fe: boolean) => {
    dispatch({ type: 'LOG_EXERCISE', date: dateStr, exerciseId: exercise.id, entry: { sets: newSets, feltEasy: fe } as ExerciseEntry })
  }

  const confirmSet = (i: number) => {
    if (readOnly) return  // viewers cannot log — server also rejects PUT /api/state
    const newConfirmed = confirmed.map((c, idx) => idx === i ? true : c)
    setConfirmed(newConfirmed)
    saveEntry(sets, feltEasy)
    if (i < target.sets - 1) {
      const ctx = audioCtx ?? onAudioCtxInit()
      playDoneSound(ctx)
      if (navigator.vibrate) navigator.vibrate(80)
      setShowTimer(true)
    } else {
      const ctx = audioCtx ?? onAudioCtxInit()
      playDoneSound(ctx)
      if (navigator.vibrate) navigator.vibrate([80, 60, 120])
    }
  }

  const updateSet = (i: number, field: keyof SetEntry, raw: string) => {
    const val = raw === '' ? undefined : Number(raw)
    const newSets = sets.map((s, idx) => idx === i ? { ...s, [field]: val } : s)
    setSets(newSets)
    saveEntry(newSets, feltEasy)
  }

  const toggleFeltEasy = () => {
    const fe = !feltEasy
    setFeltEasy(fe)
    saveEntry(sets, fe)
  }

  const allDone = confirmed.every(Boolean)
  const doneSets = confirmed.filter(Boolean).length

  return (
    <div className={`card exercise-card${allDone ? ' exercise-done' : ''}`} style={{ marginBottom: 10 }}>
      {showTimer && (
        <RestTimer defaultSecs={restDefault} audioCtx={audioCtx} onDismiss={() => setShowTimer(false)} />
      )}

      <div className="row gap-8 mb-8">
        {dragHandleListeners && (
          <DragHandle listeners={dragHandleListeners} attributes={dragHandleAttributes} />
        )}
        <button
          className="exercise-title-btn"
          onClick={() => setExpanded(x => !x)}
          aria-expanded={expanded}
          aria-controls={`ex-body-${exercise.id}`}
        >
          <span className="exercise-name">{exercise.name}</span>
          {partnerHere && (
            <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--accent)', flexShrink: 0 }}
              title={`${partnerHere} is here`} aria-label={`${partnerHere} is on this exercise`}>
              {partnerHere}
            </span>
          )}
          <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
            {target.sets}x{target.seconds ?? target.reps}{exercise.perSide ? '/side' : ''}{target.addLoad ? ' +load' : ''}
          </span>
          {allDone
            ? <span className="badge badge-green" style={{ marginLeft: 'auto', marginRight: 4 }}>done</span>
            : <span className="muted" style={{ marginLeft: 'auto', marginRight: 4, fontSize: 12 }}>{doneSets}/{target.sets}</span>
          }
          <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>{expanded ? '▲' : '▼'}</span>
        </button>
        <VideoCarousel urls={exercise.videoUrls} />
        {onStartFocus && (
          <button className="btn btn-sm btn-secondary" onClick={onStartFocus} aria-label={`Focus on ${exercise.name}`}>⊞</button>
        )}
      </div>

      {exercise.safetyCues.length > 0 && expanded && (
        <div className="safety-banner" style={{ marginBottom: 8 }} role="note">
          {exercise.safetyCues.includes('knee') && 'Knees track over toes, never cave inward. '}
          {exercise.safetyCues.includes('back') && 'Hinge at hips, back stays flat.'}
        </div>
      )}

      {expanded && (
        <div className="muted mb-8" style={{ fontSize: 12 }}>
          {prev ? (
            <>
              Last: {prev.sets.map(s => formatSet(s, exercise)).join(', ')}
              {suggestion !== null && <span style={{ color: 'var(--accent)', marginLeft: 8 }}>{`→ ${suggestion}kg`}</span>}
            </>
          ) : 'No previous data - start light.'}
        </div>
      )}

      <div id={`ex-body-${exercise.id}`}>
        {(expanded ? sets : sets.slice(0, Math.max(1, doneSets + 1))).map((s, i) => {
          const isConfirmed = confirmed[i]
          const isEditing = editing === i
          const prevSet = prev?.sets[i]
          const delta = isConfirmed ? deltaLabel(s, prevSet, exercise) : null

          return (
            <div key={i} className={`set-row2${isConfirmed ? ' set-confirmed' : ''}`} aria-label={`Set ${i + 1}`}>
              <span className="set-num2" aria-hidden="true">{i + 1}</span>

              {isConfirmed && !isEditing ? (
                <button
                  className="set-display"
                  onClick={() => setEditing(i)}
                  aria-label={`Set ${i + 1}: ${formatSet(s, exercise)}. Tap to edit.`}
                >
                  <span className="set-display-val">{formatSet(s, exercise)}</span>
                  {delta && (
                    <span className={`set-delta ${delta.positive ? 'delta-pos' : 'delta-neg'}`}>
                      {delta.text}
                    </span>
                  )}
                </button>
              ) : isEditing ? (
                <div className="set-inputs" role="group" aria-label={`Edit set ${i + 1}`}>
                  {exercise.requiresKg ? (
                    <input id={`${exercise.id}-${i}-kg`} type="number" className="input-sm" placeholder="kg"
                      value={s.kg ?? ''} onChange={e => updateSet(i, 'kg', e.target.value)}
                      min={0} step={0.5} aria-label="Weight in kg" autoFocus />
                  ) : <span />}
                  {target.seconds ? (
                    <input type="number" className="input-sm" placeholder="sec"
                      value={s.seconds ?? ''} onChange={e => updateSet(i, 'seconds', e.target.value)} min={0} aria-label="Seconds" />
                  ) : (
                    <input type="number" className="input-sm" placeholder="reps"
                      value={s.reps ?? ''} onChange={e => updateSet(i, 'reps', e.target.value)} min={0} aria-label="Reps" />
                  )}
                  <input type="number" className="input-sm" placeholder="RIR"
                    value={s.rir ?? ''} onChange={e => updateSet(i, 'rir', e.target.value)} min={0} max={10} aria-label="Reps in reserve" />
                  <button className="btn-check" onClick={() => { setEditing(null); confirmSet(i) }} aria-label="Confirm set" disabled={readOnly}>✓</button>
                </div>
              ) : (
                <div className="set-inputs" role="group" aria-label={`Set ${i + 1} inputs`}>
                  {exercise.requiresKg ? (
                    <input type="number" className="input-sm" placeholder="kg"
                      value={s.kg ?? ''} onChange={e => updateSet(i, 'kg', e.target.value)} min={0} step={0.5} aria-label="Weight in kg" />
                  ) : <span />}
                  {target.seconds ? (
                    <input type="number" className="input-sm" placeholder="sec"
                      value={s.seconds ?? ''} onChange={e => updateSet(i, 'seconds', e.target.value)} min={0} aria-label="Seconds" />
                  ) : (
                    <input type="number" className="input-sm" placeholder="reps"
                      value={s.reps ?? ''} onChange={e => updateSet(i, 'reps', e.target.value)} min={0} aria-label="Reps" />
                  )}
                  <input type="number" className="input-sm" placeholder="RIR"
                    value={s.rir ?? ''} onChange={e => updateSet(i, 'rir', e.target.value)} min={0} max={10} aria-label="Reps in reserve" />
                  <button className="btn-check" onClick={() => confirmSet(i)} aria-label={`Confirm set ${i + 1}`} disabled={readOnly}>✓</button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {expanded && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 10 }}>
            <input type="checkbox" checked={feltEasy} onChange={toggleFeltEasy} aria-label="Felt easy" />
            <span style={{ fontSize: 13 }}>Felt easy (suggest heavier next time)</span>
          </label>
          {exercise.notes && (
            <div className="muted mt-8" style={{ fontSize: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>{exercise.notes}</div>
          )}
          {exercise.alternatives.length > 0 && (
            <div className="muted" style={{ fontSize: 12 }}>Alt: {exercise.alternatives.join(', ')}</div>
          )}
        </>
      )}
    </div>
  )
}

interface FocusModeProps {
  exercises: ExerciseDef[]
  startIndex: number
  dateStr: string
  programWeek: number
  audioCtx: AudioContext | null
  onAudioCtxInit: () => AudioContext
  onClose: () => void
  readOnly?: boolean
}

function FocusMode({ exercises, startIndex, dateStr, programWeek, audioCtx, onAudioCtxInit, onClose, readOnly }: FocusModeProps) {
  const [idx, setIdx] = useState(startIndex)
  const ex = exercises[idx]

  return (
    <div className="focus-overlay" role="dialog" aria-label="Focus workout mode" aria-modal="true">
      <div className="focus-header">
        <button className="btn btn-secondary btn-sm" onClick={onClose} aria-label="Exit focus mode">Exit focus</button>
        <span className="muted" style={{ fontSize: 13 }}>{idx + 1} / {exercises.length}</span>
        <div className="focus-progress-bar" aria-hidden="true">
          <div className="focus-progress-fill" style={{ width: `${((idx + 1) / exercises.length) * 100}%` }} />
        </div>
      </div>

      <div className="focus-body">
        <ExerciseLogger
          key={`focus-${dateStr}-${ex.id}`}
          exercise={ex}
          dateStr={dateStr}
          programWeek={programWeek}
          audioCtx={audioCtx}
          onAudioCtxInit={onAudioCtxInit}
          readOnly={readOnly}
        />
      </div>

      <div className="focus-nav">
        <button className="btn btn-secondary" style={{ flex: 1 }} disabled={idx === 0}
          onClick={() => setIdx(i => i - 1)} aria-label="Previous exercise">Prev</button>
        {idx < exercises.length - 1 ? (
          <button className="btn btn-primary" style={{ flex: 2 }}
            onClick={() => setIdx(i => i + 1)} aria-label="Next exercise">Next</button>
        ) : (
          <button className="btn btn-primary" style={{ flex: 2 }}
            onClick={onClose} aria-label="Finish workout">Finish</button>
        )}
      </div>
    </div>
  )
}

type GymWorkout = 'A' | 'B'

const WORKOUT_OPTIONS: { value: Session['workout']; label: string }[] = [
  { value: 'A', label: 'Workout A' },
  { value: 'B', label: 'Workout B' },
  { value: 'bike', label: 'Bike / Run' },
  { value: 'rest', label: 'Rest' },
]

export default function WorkoutView({ username, level }: { username: string; level?: Privilege }) {
  const readOnly = level === 'viewer'
  const { state, dispatch, syncStatus } = useStore()
  const todayStr = todayKey()
  const [dateStr, setDateStr] = useState(todayStr)
  const [focusIndex, setFocusIndex] = useState<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  const initAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      audioCtxRef.current = new Ctor!()
    }
    return audioCtxRef.current
  }, [])

  const existingSession = state.sessions[dateStr]

  function scheduledWorkout(date: string): Session['workout'] {
    if (!state.startDate) return 'rest'
    const d = keyToDate(date)
    const week = computeProgramWeek(state.startDate, state.skippedWeeks, d)
    const sched = scheduleFor(week)
    const day = todayDayName(d)
    const act = sched[day]
    if (act === 'gym-a') return 'A'
    if (act === 'gym-b') return 'B'
    if (act === 'bike' || act === 'run') return 'bike'
    return 'rest'
  }

  const defaultWorkout = existingSession?.workout ?? scheduledWorkout(dateStr)
  const [workoutType, setWorkoutType] = useState<Session['workout']>(defaultWorkout)

  const handleDateChange = (newDate: string) => {
    setDateStr(newDate)
    setFocusIndex(null)
    const existing = state.sessions[newDate]
    setWorkoutType(existing?.workout ?? scheduledWorkout(newDate))
  }

  const isGym = workoutType === 'A' || workoutType === 'B'
  const session = state.sessions[dateStr]
  const programWeek = state.startDate
    ? computeProgramWeek(state.startDate, state.skippedWeeks, keyToDate(dateStr))
    : 1

  const planExercises = isGym ? getWorkoutExercises(workoutType as GymWorkout, programWeek) : []
  const planOrder = planExercises.map(e => e.id)

  // ── Phase 13: session resolution (alone / with-partner / resume) ──────────
  interface SessionInfo { id: number; mode: 'solo' | 'shared'; participants: { username: string }[] }
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)
  const [partnerCandidate, setPartnerCandidate] = useState<string | null>(null)
  const [showStartModal, setShowStartModal] = useState(false)
  const [resolveNonce, setResolveNonce] = useState(0)

  const applySession = useCallback((data: { session: { id: number; mode: 'solo' | 'shared' }; participants: { username: string }[] }) => {
    setSessionId(data.session.id)
    setSessionInfo({ id: data.session.id, mode: data.session.mode, participants: data.participants })
    setShowStartModal(false)
  }, [])

  const createSession = useCallback((mode: 'solo' | 'shared', partnerUsername?: string) => {
    fetch('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ scopeDate: dateStr, workout: workoutType, mode, partnerUsername }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.session) applySession(data) })
      .catch(() => { /* offline — WorkoutView still renders plan order */ })
  }, [dateStr, workoutType, applySession])

  // On opening a gym workout: resume an active session, else prompt (if a partner
  // exists) or silently create a solo one.
  useEffect(() => {
    if (!isGym) {
      setSessionId(null); setSessionInfo(null); setShowStartModal(false)
      return
    }
    let cancelled = false
    setSessionId(null)
    setSessionInfo(null)
    setShowStartModal(false)
    Promise.all([
      fetch(`/api/session/current?scopeDate=${encodeURIComponent(dateStr)}&workout=${encodeURIComponent(workoutType)}`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : { session: null }),
      fetch('/api/session/partner-candidates', { credentials: 'include' })
        .then(r => r.ok ? r.json() : { candidates: [] }),
    ])
      .then(([cur, cand]: [{ session: { id: number; mode: 'solo' | 'shared' } | null; participants?: { username: string }[] }, { candidates: { username: string }[] }]) => {
        if (cancelled) return
        const candidate = cand.candidates?.[0]?.username ?? null
        setPartnerCandidate(candidate)
        if (cur.session) {
          applySession({ session: cur.session, participants: cur.participants ?? [] })
        } else if (candidate) {
          setShowStartModal(true)
        } else {
          createSession('solo')
        }
      })
      .catch(() => { if (!cancelled) createSession('solo') })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr, workoutType, isGym, resolveNonce])

  const endCurrentSession = useCallback(async () => {
    if (sessionId == null) return
    try {
      await fetch(`/api/session/${sessionId}/end`, { method: 'POST', credentials: 'include' })
    } catch { /* ignore — re-resolve anyway */ }
    setSessionId(null)
    setSessionInfo(null)
    setResolveNonce(n => n + 1)  // re-prompt / re-create
  }, [sessionId])

  const partnerNames = sessionInfo?.participants.map(p => p.username).filter(u => u !== username) ?? []

  const { order: liveOrder, reorder, wsStatus, partnerPresence, sendPresence } = useLiveOrder({
    planOrder,
    date: dateStr,
    workoutType,
    username,
    enabled: isGym && sessionId != null,
    sessionId,
  })

  const exerciseMap = new Map(planExercises.map(e => [e.id, e]))
  const exercises = liveOrder
    .map(id => exerciseMap.get(id))
    .filter((e): e is ExerciseDef => e !== undefined)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = liveOrder.indexOf(active.id as string)
    const newIndex = liveOrder.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return
    reorder(arrayMove(liveOrder, oldIndex, newIndex))
  }

  const wsLabel =
    wsStatus === 'open'       ? { symbol: 'Live', color: 'var(--green)' } :
    wsStatus === 'connecting' ? { symbol: 'Connecting...', color: 'var(--text-muted)' } :
    /* closed */                { symbol: 'Offline', color: 'var(--text-muted)' }

  const syncDot =
    syncStatus === 'synced'  ? { color: 'var(--green)',      label: 'Synced' } :
    syncStatus === 'syncing' ? { color: 'var(--text-muted)', label: 'Syncing...' } :
    syncStatus === 'offline' ? { color: 'var(--text-muted)', label: 'Offline' } :
    syncStatus === 'error'   ? { color: 'var(--red)',         label: 'Sync error' } :
    /* loading */              { color: 'var(--text-muted)', label: 'Loading...' }

  if (!state.startDate) {
    return <p className="muted">Set your start date on the Home tab first.</p>
  }

  return (
    <>
      {showStartModal && isGym && (
        <StartSessionModal
          partner={partnerCandidate ? { username: partnerCandidate } : null}
          onChoose={(mode, partnerUsername) => createSession(mode, partnerUsername)}
        />
      )}

      {focusIndex !== null && isGym && (
        <FocusMode
          exercises={exercises}
          startIndex={focusIndex}
          dateStr={dateStr}
          programWeek={programWeek}
          audioCtx={audioCtxRef.current}
          onAudioCtxInit={initAudio}
          onClose={() => setFocusIndex(null)}
          readOnly={readOnly}
        />
      )}

      <div>
        {readOnly && (
          <div className="card mb-12" role="note" style={{ borderColor: 'var(--text-muted)' }}>
            <span className="muted" style={{ fontSize: 13 }}>
              👁 View-only access — you can browse workouts but logging is disabled.
            </span>
          </div>
        )}
        <div className="card mb-12">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <div className="card-title" style={{ margin: 0 }}>Session date</div>
            <span style={{ fontSize: 11, color: syncDot.color }}>{syncDot.label}</span>
          </div>
          <input
            type="date"
            className="input mb-12"
            value={dateStr}
            max={todayStr}
            onChange={e => handleDateChange(e.target.value)}
            aria-label="Session date"
          />
          <div className="card-title">Workout type</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Workout type">
            {WORKOUT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`btn btn-sm ${workoutType === opt.value ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setWorkoutType(opt.value)}
                aria-pressed={workoutType === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {isGym && (
          <>
            <div className="row gap-8 mb-8" style={{ flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0 }}>
                Workout {workoutType} - {getWorkout(workoutType as GymWorkout)?.name}
              </h2>
              {session?.done && <span className="badge badge-green">Done</span>}
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginLeft: 'auto' }}
                onClick={() => setFocusIndex(0)}
                aria-label="Enter focus mode"
              >
                Focus mode
              </button>
            </div>

            {/* Session bar: mode + end-session affordance (Phase 13) */}
            {sessionId != null && (
              <div className="row gap-8 mb-8" style={{ alignItems: 'center', fontSize: 12 }}>
                <span className="muted">
                  {sessionInfo?.mode === 'shared'
                    ? `👥 Shared session${partnerNames.length ? ` with ${partnerNames.join(', ')}` : ''}`
                    : '🏋️ Solo session'}
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ marginLeft: 'auto' }}
                  onClick={endCurrentSession}
                  aria-label="End session"
                >
                  End session
                </button>
              </div>
            )}

            <div className="safety-banner mb-12" role="note">
              Key rule: No loaded spinal flexion. Knees track over toes.
            </div>

            <div className="card mb-12">
              <span className="muted" style={{ fontSize: 13 }}>
                Warmup: {getWorkout(workoutType as GymWorkout)?.warmup}
              </span>
            </div>

            {repBandFor(programWeek) > repBandFor(programWeek - 1) && programWeek > 1 && (
              <div className="card mb-12" style={{ borderColor: 'var(--accent)' }} role="note">
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>New rep phase</div>
                <div className="muted" style={{ fontSize: 12 }}>Rep range dropped. Consider increasing weight ~10%.</div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 11, color: wsLabel.color }}>
              <span>{wsLabel.symbol}</span>
              {partnerPresence.size > 0 && (
                <span style={{ color: 'var(--accent)', marginLeft: 4 }}>
                  {[...partnerPresence.keys()].join(', ')} online
                </span>
              )}
              <span className="muted" style={{ marginLeft: 'auto', fontSize: 10 }}>Drag to reorder</span>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={liveOrder} strategy={verticalListSortingStrategy}>
                {exercises.map((ex, i) => (
                  <SortableExerciseLogger
                    key={`${dateStr}-${ex.id}`}
                    exercise={ex}
                    dateStr={dateStr}
                    programWeek={programWeek}
                    onStartFocus={() => { setFocusIndex(i); sendPresence(ex.id) }}
                    audioCtx={audioCtxRef.current}
                    onAudioCtxInit={initAudio}
                    partnerHere={[...partnerPresence.entries()].find(([, eid]) => eid === ex.id)?.[0]}
                    readOnly={readOnly}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </>
        )}

        {!isGym && (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>
              {workoutType === 'bike' ? 'Bike / Run day - no set logging needed.' : 'Rest day.'}
            </p>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          {session?.done ? (
            <button className="btn btn-secondary w-full" onClick={() => dispatch({ type: 'UNMARK_DAY_DONE', date: dateStr })}>
              Undo completion
            </button>
          ) : (
            <button className="btn btn-primary w-full" onClick={() => dispatch({ type: 'MARK_DAY_DONE', date: dateStr, workout: workoutType })}>
              Mark {WORKOUT_OPTIONS.find(o => o.value === workoutType)?.label} done
            </button>
          )}
        </div>
      </div>
    </>
  )
}
