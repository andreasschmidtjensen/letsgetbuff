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
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { useStore } from '../store/store'
import { useLiveOrder } from '../store/useLiveOrder'
import { preloadTimerSounds } from '../lib/sounds'
import StartSessionModal from '../components/StartSessionModal'
import { START_WARMUP_FLAG } from './StretchView'
import { parseWarmup } from '../components/workout/helpers'
import { SessionTimer } from '../components/workout/timers'
import { SortableExerciseLogger } from '../components/workout/ExerciseLogger'
import FocusMode from '../components/workout/FocusMode'
import { computeProgramWeek, scheduleFor, todayDayName } from '@letsgetbuff/shared'
import { todayKey, keyToDate } from '@letsgetbuff/shared'
import { getWorkoutExercises, getWorkout, ExerciseDef, repBandFor } from '@letsgetbuff/shared'
import { Session } from '@letsgetbuff/shared'
import type { Privilege, Tab } from '@letsgetbuff/shared'

const MUTE_KEY = 'letsgetbuff-mute'
const REST_SECS_KEY = 'letsgetbuff-rest-secs'
const REST_SECS_DEFAULT = 90

type GymWorkout = 'A' | 'B'

// Issue #3: this screen is gym-only — just the two gym trainings. Runs, rides,
// rest days and home workouts are started/logged from the Home tab.
const WORKOUT_OPTIONS: { value: GymWorkout; label: string }[] = [
  { value: 'A', label: 'Workout A' },
  { value: 'B', label: 'Workout B' },
]

export default function WorkoutView({ username, level, onNavigate }: { username: string; level?: Privilege; onNavigate?: (tab: Tab) => void }) {
  const readOnly = level === 'viewer'
  const { state, dispatch, syncStatus } = useStore()
  const todayStr = todayKey()
  const [dateStr, setDateStr] = useState(todayStr)
  const [focusIndex, setFocusIndex] = useState<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTE_KEY) === '1')
  // null = no explicit preference → band-aware default (heavier 4×6 sets from
  // week 17 get 2.5 min instead of 90s).
  const [restPrefSecs, setRestPrefSecs] = useState<number | null>(() => {
    const saved = localStorage.getItem(REST_SECS_KEY)
    return saved ? Number(saved) : null
  })
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null)

  // Sync the rest preference when another tab/component updates localStorage
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === REST_SECS_KEY) {
        setRestPrefSecs(e.newValue ? Number(e.newValue) : null)
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const toggleMute = useCallback(() => {
    setMuted(m => {
      const next = !m
      localStorage.setItem(MUTE_KEY, next ? '1' : '0')
      return next
    })
  }, [])

  const initAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      audioCtxRef.current = new Ctor!()
      // First audio gesture of the session — warm the recordings so the first
      // timer alarm plays instantly.
      preloadTimerSounds()
    }
    return audioCtxRef.current
  }, [])

  // Gym workout for a date: the one scheduled that day, else the next scheduled
  // gym workout within two weeks (so a non-gym day defaults sensibly), else A.
  function scheduledWorkout(date: string): GymWorkout {
    if (!state.startDate) return 'A'
    for (let i = 0; i <= 14; i++) {
      const d = keyToDate(date)
      d.setDate(d.getDate() + i)
      const week = computeProgramWeek(state.startDate, state.skippedWeeks, d)
      const act = scheduleFor(week)[todayDayName(d)]
      if (act === 'gym-a') return 'A'
      if (act === 'gym-b') return 'B'
    }
    return 'A'
  }

  // Historical sessions may be bike/rest (logged before this screen went
  // gym-only) — those don't preselect anything here.
  function gymDefault(date: string): GymWorkout {
    const existing = state.sessions[date]
    return existing?.workout === 'A' || existing?.workout === 'B'
      ? existing.workout
      : scheduledWorkout(date)
  }

  const [workoutType, setWorkoutType] = useState<GymWorkout>(() => gymDefault(dateStr))

  const handleDateChange = (newDate: string) => {
    setDateStr(newDate)
    setFocusIndex(null)
    setWorkoutType(gymDefault(newDate))
  }
  const session = state.sessions[dateStr]
  const programWeek = state.startDate
    ? computeProgramWeek(state.startDate, state.skippedWeeks, keyToDate(dateStr))
    : 1
  const restDefaultSecs = restPrefSecs ?? (repBandFor(programWeek) === 3 ? 150 : REST_SECS_DEFAULT)

  const planExercises = getWorkoutExercises(workoutType, programWeek)
  const planOrder = planExercises.map(e => e.id)

  // ── Phase 13: session resolution (alone / with-partner / resume) ──────────
  interface SessionInfo { id: number; mode: 'solo' | 'shared'; participants: { username: string }[] }
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)
  const [partnerCandidate, setPartnerCandidate] = useState<string | null>(null)
  const [showStartModal, setShowStartModal] = useState(false)
  const [resolveNonce, setResolveNonce] = useState(0)
  // Phase 16: proxy input — null = logging for self; string = logging for partner
  const [proxyFor, setProxyFor] = useState<string | null>(null)

  const applySession = useCallback((data: { session: { id: number; mode: 'solo' | 'shared' }; participants: { username: string }[] }) => {
    setSessionId(data.session.id)
    setSessionInfo({ id: data.session.id, mode: data.session.mode, participants: data.participants })
    setShowStartModal(false)
    setSessionStartedAt(Date.now())
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
  // exists) or silently create a solo one. Viewers never participate in sessions
  // (the server 403s POST /api/session), so they skip resolution entirely and just
  // observe the plan order read-only.
  useEffect(() => {
    if (readOnly) {
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
  }, [dateStr, workoutType, readOnly, resolveNonce])

  const endCurrentSession = useCallback(async () => {
    if (sessionId == null) return
    try {
      await fetch(`/api/session/${sessionId}/end`, { method: 'POST', credentials: 'include' })
    } catch { /* ignore — re-resolve anyway */ }
    setSessionId(null)
    setSessionInfo(null)
    setProxyFor(null)
    setResolveNonce(n => n + 1)  // re-prompt / re-create
  }, [sessionId])

  const partnerNames = sessionInfo?.participants.map(p => p.username).filter(u => u !== username) ?? []
  const partnerName = partnerNames[0] ?? null
  const isShared = sessionInfo?.mode === 'shared' && partnerName != null

  // Partner's sessions blob — powers the dual logger in focus mode. Best-effort:
  // if the fetch fails the partner logger simply starts blank.
  const [partnerState, setPartnerState] = useState<{ sessions: Record<string, Session> } | null>(null)
  const [partnerNonce, setPartnerNonce] = useState(0)
  const refreshPartner = useCallback(() => setPartnerNonce(n => n + 1), [])

  useEffect(() => {
    if (!isShared) { setPartnerState(null); return }
    let cancelled = false
    fetch('/api/partner-history', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: { sessions?: Record<string, Session> } | null) => {
        if (cancelled || !data) return
        setPartnerState({ sessions: data.sessions ?? {} })
      })
      .catch(() => { /* best-effort */ })
    return () => { cancelled = true }
  }, [isShared, partnerNonce, dateStr, workoutType])

  const { order: liveOrder, reorder, wsStatus, partnerPresence, sendPresence } = useLiveOrder({
    planOrder,
    date: dateStr,
    workoutType,
    username,
    enabled: sessionId != null,
    sessionId,
  })

  const exerciseMap = new Map(planExercises.map(e => [e.id, e]))
  const exercises = liveOrder
    .map(id => exerciseMap.get(id))
    .filter((e): e is ExerciseDef => e !== undefined)

  // The workout's cardio warm-up, shown as the first timed slide in focus mode.
  const focusWarmup = parseWarmup(getWorkout(workoutType)?.warmup)

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
      {showStartModal && (
        <StartSessionModal
          partner={partnerCandidate ? { username: partnerCandidate } : null}
          onChoose={(mode, partnerUsername) => createSession(mode, partnerUsername)}
          onCancel={() => { setShowStartModal(false); createSession('solo') }}
        />
      )}

      {focusIndex !== null && (
        <FocusMode
          exercises={exercises}
          startIndex={focusIndex}
          dateStr={dateStr}
          programWeek={programWeek}
          audioCtx={audioCtxRef.current}
          onAudioCtxInit={initAudio}
          onClose={() => setFocusIndex(null)}
          readOnly={readOnly}
          muted={muted}
          restDefaultSecs={restDefaultSecs}
          sessionId={sessionId}
          workoutType={workoutType}
          partnerName={isShared ? partnerName : null}
          partnerState={isShared ? partnerState : null}
          refreshPartner={refreshPartner}
          sendPresence={sendPresence}
          warmup={focusWarmup}
        />
      )}

      <div className="view-narrow">
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

        <div className="row gap-8 mb-8" style={{ flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>
            Workout {workoutType} - {getWorkout(workoutType)?.name}
          </h2>
          {session?.done && <span className="badge badge-green">Done</span>}
          {sessionStartedAt && <SessionTimer startedAt={sessionStartedAt} />}
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginLeft: 'auto' }}
            onClick={toggleMute}
            aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
            title={muted ? 'Unmute sounds' : 'Mute sounds'}
          >
            {muted ? '🔇' : '🔔'}
          </button>
        </div>

        {/* Session bar: mode + end-session affordance (Phase 13) + proxy toggle (Phase 16) */}
        {sessionId != null && (
          <div className="row gap-8 mb-8" style={{ alignItems: 'center', fontSize: 12, flexWrap: 'wrap' }}>
            <span className="muted">
              {sessionInfo?.mode === 'shared'
                ? `👥 Shared${partnerNames.length ? ` with ${partnerNames.join(', ')}` : ''}`
                : '🏋️ Solo'}
            </span>
            {/* Phase 16: proxy toggle — only in shared sessions */}
            {sessionInfo?.mode === 'shared' && partnerNames.length > 0 && (
              <div className="row gap-4" style={{ alignItems: 'center' }}>
                <span className="muted">Log for:</span>
                <button
                  className={`btn btn-sm ${!proxyFor ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setProxyFor(null)}
                  aria-pressed={!proxyFor}
                >
                  Me
                </button>
                {partnerNames.map(p => (
                  <button
                    key={p}
                    className={`btn btn-sm ${proxyFor === p ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setProxyFor(p)}
                    aria-pressed={proxyFor === p}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginLeft: 'auto' }}
              onClick={endCurrentSession}
              aria-label="End session"
            >
              End
            </button>
          </div>
        )}
        {proxyFor && (
          <div className="card mb-8" role="note" style={{ borderColor: 'var(--accent)', padding: '6px 10px' }}>
            <span style={{ fontSize: 12, color: 'var(--accent)' }}>
              Logging for <strong>{proxyFor}</strong> — your own data is unaffected.
            </span>
          </div>
        )}

        <div className="safety-banner mb-12" role="note">
          Key rule: No loaded spinal flexion. Knees track over toes.
        </div>

        <div className="card mb-12">
          <span className="muted" style={{ fontSize: 13 }}>
            Warmup: {getWorkout(workoutType)?.warmup}
          </span>
        </div>

        {repBandFor(programWeek) > repBandFor(programWeek - 1) && programWeek > 1 && (
          <div className="card mb-12" style={{ borderColor: 'var(--accent)' }} role="note">
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>New rep phase</div>
            <div className="muted" style={{ fontSize: 12 }}>Rep range dropped. Consider increasing weight ~10%.</div>
          </div>
        )}

        {exercises.length > 0 && (
          <button
            className="btn btn-primary btn-start-focus"
            onClick={() => setFocusIndex(0)}
            aria-label="Start focus mode"
          >
            ▶ Start focus mode
          </button>
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
                onStartFocus={() => { setFocusIndex(focusWarmup ? i + focusWarmup.length : i); sendPresence(ex.id) }}
                audioCtx={audioCtxRef.current}
                onAudioCtxInit={initAudio}
                partnerHere={[...partnerPresence.entries()].find(([, eid]) => eid === ex.id)?.[0]}
                readOnly={readOnly}
                muted={muted}
                restDefaultSecs={restDefaultSecs}
                proxyFor={proxyFor}
                sessionId={sessionId}
                workoutType={workoutType}
              />
            ))}
          </SortableContext>
        </DndContext>

        {onNavigate && (
          <div className="card mb-12">
            <div className="card-title">Pre-gym warm-up</div>
            <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
              A ~5 min flow before lifting. The full stretch program lives on its own tab.
            </p>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => { sessionStorage.setItem(START_WARMUP_FLAG, '1'); onNavigate('stretch') }}
            >
              ▶ Start warm-up flow (~5 min)
            </button>
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
