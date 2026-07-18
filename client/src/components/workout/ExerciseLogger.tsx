import { useState } from 'react'
import type { DraggableAttributes } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useStore } from '../../store/store'
import { sendProxyLog } from '../../store/persistence'
import { useTestMode } from '../../store/testMode'
import { playDoneSound } from '../../lib/sounds'
import { suggestNextWeight, repTargetFor, keyToDate } from '@letsgetbuff/shared'
import type { ExerciseDef, ExerciseEntry, SetEntry, Session } from '@letsgetbuff/shared'
import { RestTimer, ExerciseTimer, VideoCarousel, VideoPanel } from './timers'
import { parseYouTubeUrl } from '../../lib/youtube'
import { lastSessionBefore, formatSet, deltaLabel, formatDuration } from './helpers'

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

export interface ExerciseLoggerProps {
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
  muted: boolean
  restDefaultSecs: number
  /** When set, log this exercise for the partner (proxy mode). */
  proxyFor?: string | null
  sessionId?: number | null
  workoutType?: string
  /** Alternate data source (partner's sessions) — when set, read existing/prev from here. */
  dataState?: { sessions: Record<string, Session> }
  /** Small header chip identifying whose log this is ("You" / partner name). */
  participantLabel?: string
  /** Called after a proxy save so the parent can refresh partner data. */
  onLogged?: () => void
  /** Render in the larger focus layout and start expanded. */
  focus?: boolean
}

export function SortableExerciseLogger(props: ExerciseLoggerProps) {
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

export function ExerciseLogger({ exercise, dateStr, programWeek, onStartFocus, audioCtx, onAudioCtxInit, dragHandleListeners, dragHandleAttributes, partnerHere, readOnly, muted, restDefaultSecs, proxyFor, sessionId, workoutType, dataState, participantLabel, onLogged, focus }: ExerciseLoggerProps) {
  const { state, dispatch } = useStore()
  const { testMode } = useTestMode()
  // In proxy mode the partner's sessions blob is the data source; otherwise own store.
  const read = dataState ?? state
  const existing = read.sessions[dateStr]?.entries[exercise.id]
  const prev = lastSessionBefore(read, exercise.id, dateStr)

  const lastWeight = prev?.sets.find(s => s.kg !== undefined)?.kg
  // Days since this exercise was last logged — 14+ triggers a deload suggestion.
  const daysSinceLast = prev
    ? Math.round((keyToDate(dateStr).getTime() - keyToDate(prev.date).getTime()) / 86400000)
    : undefined
  const suggestion = suggestNextWeight(exercise.progressionType, lastWeight, prev?.feltEasy ?? false, daysSinceLast)
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
  const [expanded, setExpanded] = useState(focus ?? false)
  // Embedded video (Phase 21): focus mode shows the self card's video by
  // default (like stretch cards); the list and the partner proxy card start
  // collapsed so the workout list stays scannable.
  const hasEmbeddable = exercise.videoUrls.some(u => parseYouTubeUrl(u) !== null)
  const [showVideo, setShowVideo] = useState(Boolean(focus) && !proxyFor && hasEmbeddable)
  const [showTimer, setShowTimer] = useState(false)
  const [timingSet, setTimingSet] = useState<number | null>(null)
  const restDefault = restDefaultSecs

  const saveEntry = (newSets: SetEntry[], fe: boolean) => {
    if (proxyFor && sessionId != null && workoutType) {
      // Test mode: don't write to the partner's real log (own edits stay in-memory
      // via the reducer; the store suppresses their persistence).
      if (testMode) return
      // Proxy mode: write to the partner's state server-side only. A failed
      // send is queued in localStorage and retried by the store's sync loop.
      sendProxyLog({ sessionId, date: dateStr, exerciseId: exercise.id, workout: workoutType, entry: { sets: newSets, feltEasy: fe } })
        .then(ok => { if (ok) onLogged?.() })
    } else {
      dispatch({ type: 'LOG_EXERCISE', date: dateStr, exerciseId: exercise.id, entry: { sets: newSets, feltEasy: fe } as ExerciseEntry })
    }
  }

  const confirmSet = (i: number) => {
    if (readOnly) return  // viewers cannot log — server also rejects PUT /api/state
    const newConfirmed = confirmed.map((c, idx) => idx === i ? true : c)
    setConfirmed(newConfirmed)
    saveEntry(sets, feltEasy)
    if (i < target.sets - 1) {
      if (!muted) { const ctx = audioCtx ?? onAudioCtxInit(); playDoneSound(ctx) }
      if (navigator.vibrate) navigator.vibrate(80)
      setShowTimer(true)
    } else {
      if (!muted) { const ctx = audioCtx ?? onAudioCtxInit(); playDoneSound(ctx) }
      if (navigator.vibrate) navigator.vibrate([80, 60, 120])
    }
  }

  // Timed exercise: the countdown finished (or was stopped) → log the achieved seconds,
  // confirm the set, and run the same side-effects as a manual confirm.
  const completeTimedSet = (i: number, achievedSecs: number) => {
    setTimingSet(null)
    if (readOnly) return
    const newSets = sets.map((s, idx) => idx === i ? { ...s, seconds: achievedSecs } : s)
    setSets(newSets)
    setConfirmed(confirmed.map((c, idx) => idx === i ? true : c))
    saveEntry(newSets, feltEasy)
    // The countdown's own alarm already sounded; just buzz + offer rest.
    if (i < target.sets - 1) {
      if (navigator.vibrate) navigator.vibrate(80)
      setShowTimer(true)
    } else {
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
        <RestTimer defaultSecs={restDefault} audioCtx={audioCtx} muted={muted} onDismiss={() => setShowTimer(false)} />
      )}
      {timingSet !== null && (
        <ExerciseTimer
          targetSecs={sets[timingSet]?.seconds ?? target.seconds ?? 30}
          onComplete={(achieved) => completeTimedSet(timingSet, achieved)}
          onCancel={() => setTimingSet(null)}
          audioCtx={audioCtx}
          onAudioCtxInit={onAudioCtxInit}
          muted={muted}
        />
      )}

      {participantLabel && (
        <div className="focus-participant" aria-label={`Logging for ${participantLabel}`}>{participantLabel}</div>
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
        {hasEmbeddable ? (
          <button
            className="video-toggle"
            onClick={() => setShowVideo(v => !v)}
            aria-expanded={showVideo}
            aria-controls={`ex-video-${exercise.id}`}
          >
            {showVideo ? 'Hide video' : '▶ Video'}
          </button>
        ) : (
          <VideoCarousel urls={exercise.videoUrls} />
        )}
        {onStartFocus && (
          <button className="btn btn-sm btn-secondary" onClick={onStartFocus} aria-label={`Focus on ${exercise.name}`}>⊞</button>
        )}
      </div>

      {showVideo && hasEmbeddable && (
        <div id={`ex-video-${exercise.id}`} className="mb-8">
          <VideoPanel urls={exercise.videoUrls} title={exercise.name} />
        </div>
      )}

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
              ) : target.seconds ? (
                <div className="set-inputs" role="group" aria-label={`Set ${i + 1} inputs`}>
                  <button
                    className="btn btn-primary btn-start-timer"
                    onClick={() => setTimingSet(i)}
                    aria-label={`Start ${s.seconds ?? target.seconds} second timer for set ${i + 1}`}
                    disabled={readOnly}
                  >
                    ▶ Start {formatDuration(s.seconds ?? target.seconds ?? 0)}
                  </button>
                  <input type="number" className="input-sm" placeholder="sec"
                    value={s.seconds ?? ''} onChange={e => updateSet(i, 'seconds', e.target.value)} min={0} aria-label="Seconds (manual entry)" />
                  <button className="btn-check" onClick={() => confirmSet(i)} aria-label={`Confirm set ${i + 1}`} disabled={readOnly}>✓</button>
                </div>
              ) : (
                <div className="set-inputs" role="group" aria-label={`Set ${i + 1} inputs`}>
                  {exercise.requiresKg ? (
                    <input type="number" className="input-sm" placeholder="kg"
                      value={s.kg ?? ''} onChange={e => updateSet(i, 'kg', e.target.value)} min={0} step={0.5} aria-label="Weight in kg" />
                  ) : <span />}
                  <input type="number" className="input-sm" placeholder="reps"
                    value={s.reps ?? ''} onChange={e => updateSet(i, 'reps', e.target.value)} min={0} aria-label="Reps" />
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
