import { useEffect, useState } from 'react'
import { useStore } from '../../../store/store'
import { sendProxyLog } from '../../../store/persistence'
import { useTestMode } from '../../../store/testMode'
import { repTargetFor, suggestNextWeight, keyToDate } from '@letsgetbuff/shared'
import type { ExerciseDef, ExerciseEntry, SetEntry, Session } from '@letsgetbuff/shared'
import TestModeBanner from '../../TestModeBanner'
import { SessionTimer, VideoPanel } from '../timers'
import { lastSessionBefore } from '../helpers'
import ExerciseCardV2 from './ExerciseCardV2'
import RestDock from './RestDock'
import UiVersionChip from './UiVersionChip'
import { useRestLanes, TOGETHER_KEY } from './useRestLanes'
import { getRestMode, getRestSecs, setRestMode, type RestMode } from './restMode'
import { exerciseDoneInV2, formatSide, setComplete } from './helpers'

/**
 * Focus mode v2. Same job as v1's `FocusMode` — one exercise at a time, prev /
 * next, the same reducer actions and the same `sendProxyLog` — but rest lives in
 * the dock instead of a modal, so a countdown never blocks the phone the two of
 * you are sharing.
 */

interface FocusModeV2Props {
  exercises: ExerciseDef[]
  startIndex: number
  dateStr: string
  programWeek: number
  audioCtx: AudioContext | null
  onAudioCtxInit: () => AudioContext
  onClose: () => void
  readOnly?: boolean
  muted: boolean
  restDefaultSecs: number
  sessionId?: number | null
  workoutType?: string
  username: string
  partnerName?: string | null
  partnerState?: { sessions: Record<string, Session> } | null
  refreshPartner?: () => void
  sendPresence?: (exerciseId: string) => void
  sessionStartedAt?: number | null
  /** Finishing marks the day done and stops the session clock — see WorkoutView. */
  onFinish: () => void
}

export default function FocusModeV2(props: FocusModeV2Props) {
  const {
    exercises, startIndex, dateStr, programWeek, audioCtx, onAudioCtxInit, onClose, readOnly,
    muted, restDefaultSecs, sessionId, workoutType, username, partnerName, partnerState,
    refreshPartner, sendPresence, sessionStartedAt, onFinish,
  } = props

  const { state, dispatch } = useStore()
  const { testMode } = useTestMode()
  const shared = Boolean(partnerName && partnerState)

  const [currentId, setCurrentId] = useState(
    exercises[Math.min(Math.max(startIndex, 0), exercises.length - 1)]?.id ?? exercises[0]?.id,
  )
  const [showVideo, setShowVideo] = useState(false)
  const [partnerOpen, setPartnerOpen] = useState(false)
  const [targetLane, setTargetLane] = useState<string | null>(null)

  const lanes = useRestLanes({ muted, audioCtx, resolveAudioCtx: onAudioCtxInit })

  let idx = exercises.findIndex(e => e.id === currentId)
  if (idx === -1) idx = Math.min(startIndex, exercises.length - 1)
  const ex = exercises[idx]

  useEffect(() => {
    if (ex) sendPresence?.(ex.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId])

  // Rest mode is remembered per exercise, so the choice is made once.
  const [restModes, setRestModes] = useState<Record<string, RestMode>>({})
  const mode: RestMode = ex ? restModes[ex.id] ?? getRestMode(ex) : 'turns'
  const chooseMode = (m: RestMode) => {
    if (!ex) return
    setRestModes(r => ({ ...r, [ex.id]: m }))
    setRestMode(ex.id, m)
  }

  if (!ex) return null

  const target = repTargetFor(ex, programWeek)
  const restSecs = getRestSecs(ex.id) ?? restDefaultSecs

  const selfSets = state.sessions[dateStr]?.entries[ex.id]?.sets ?? []
  const selfFeltEasy = state.sessions[dateStr]?.entries[ex.id]?.feltEasy ?? false
  const partnerSets = partnerState?.sessions[dateStr]?.entries[ex.id]?.sets ?? []

  const prev = lastSessionBefore(state, ex.id, dateStr)
  const lastWeight = prev?.sets.find(s => s.kg !== undefined)?.kg
  const daysSinceLast = prev
    ? Math.round((keyToDate(dateStr).getTime() - keyToDate(prev.date).getTime()) / 86400000)
    : undefined
  const suggestion = suggestNextWeight(ex.progressionType, lastWeight, prev?.feltEasy ?? false, daysSinceLast)

  const saveSelf = (sets: SetEntry[]) => {
    dispatch({ type: 'LOG_EXERCISE', date: dateStr, exerciseId: ex.id, entry: { sets, feltEasy: selfFeltEasy } as ExerciseEntry })
  }

  // "Felt easy" drives the next session's weight suggestion, so it has to be
  // reachable somewhere — the overview no longer carries it.
  const toggleFeltEasy = () => {
    dispatch({ type: 'LOG_EXERCISE', date: dateStr, exerciseId: ex.id, entry: { sets: selfSets, feltEasy: !selfFeltEasy } as ExerciseEntry })
  }

  const savePartner = (sets: SetEntry[]) => {
    if (testMode || !partnerName || sessionId == null || !workoutType) return
    const feltEasy = partnerState?.sessions[dateStr]?.entries[ex.id]?.feltEasy ?? false
    sendProxyLog({ sessionId, date: dateStr, exerciseId: ex.id, workout: workoutType, entry: { sets, feltEasy } })
      .then(ok => { if (ok) refreshPartner?.() })
  }

  // A completed set starts that person's rest. Together mode uses one merged
  // lane, and a second confirm inside a running window joins it rather than
  // restarting it.
  const startRest = (who: string) => {
    if (mode === 'together' && shared) {
      lanes.startOrJoin(TOGETHER_KEY, [username, partnerName!], restSecs)
      setTargetLane(TOGETHER_KEY)
    } else {
      lanes.start(who, [who], restSecs)
      setTargetLane(who)
    }
  }

  const selfDone = exerciseDoneInV2(state.sessions, dateStr, ex, programWeek)
  const partnerDone = shared ? exerciseDoneInV2(partnerState!.sessions, dateStr, ex, programWeek) : true
  const allDone = selfDone && partnerDone

  const partnerLoggedSets = partnerSets.filter(s => setComplete(s, ex)).length
  const partnerLast = [...partnerSets].reverse().find(s => setComplete(s, ex))

  const goPrev = () => { if (idx > 0) setCurrentId(exercises[idx - 1].id); setPartnerOpen(false) }
  const goNext = () => { if (idx < exercises.length - 1) setCurrentId(exercises[idx + 1].id); setPartnerOpen(false) }
  const isLast = idx >= exercises.length - 1

  return (
    <div className="focus-overlay ui-v2 v2-focus" role="dialog" aria-label="Focus workout mode" aria-modal="true">
      <TestModeBanner />
      <div className="v2-header">
        <button className="v2-header-btn" onClick={onClose} aria-label="Exit focus mode">Overview</button>
        <span className="v2-counter">{idx + 1}/{exercises.length}</span>
        <div className="v2-progress" aria-hidden="true">
          <div className="v2-progress-fill" style={{ width: `${((idx + 1) / exercises.length) * 100}%` }} />
        </div>
        {sessionStartedAt != null && <SessionTimer startedAt={sessionStartedAt} />}
        <UiVersionChip />
      </div>

      <div className="v2-body">
        <div className="v2-title-row">
          <div>
            <div className="v2-ex-name">{ex.name}</div>
            <div className="v2-ex-target">
              {target.sets}×{target.seconds ?? target.reps}{ex.perSide ? '/side' : ''}{target.addLoad ? ' +load' : ''}
            </div>
          </div>
          {ex.videoUrls.length > 0 && (
            <button className="v2-form-btn" onClick={() => setShowVideo(v => !v)} aria-expanded={showVideo}>
              ▶ Form
            </button>
          )}
        </div>

        {showVideo && ex.videoUrls.length > 0 && (
          <VideoPanel urls={ex.videoUrls} title={ex.name} />
        )}

        {shared && (
          <div className="v2-mode-card">
            <div className="v2-seg" role="group" aria-label="Rest mode">
              <button
                className={`v2-seg-half${mode === 'together' ? ' v2-seg-on' : ''}`}
                onClick={() => chooseMode('together')}
                aria-pressed={mode === 'together'}
              >
                Together
              </button>
              <button
                className={`v2-seg-half${mode === 'turns' ? ' v2-seg-on' : ''}`}
                onClick={() => chooseMode('turns')}
                aria-pressed={mode === 'turns'}
              >
                Take turns
              </button>
            </div>
            <div className="v2-mode-note">saved for<br />{ex.name}</div>
          </div>
        )}

        <ExerciseCardV2
          key={`v2-self-${dateStr}-${ex.id}`}
          exercise={ex}
          sets={selfSets}
          targetSets={target.sets}
          targetReps={target.reps}
          targetSeconds={target.seconds}
          ownerLabel={shared ? 'You' : 'Set'}
          restMode={mode}
          shared={shared}
          lastSet={prev?.sets[0]}
          suggestion={suggestion}
          onSave={saveSelf}
          onSetComplete={() => startRest(username)}
          audioCtx={audioCtx}
          onAudioCtxInit={onAudioCtxInit}
          muted={muted}
          readOnly={readOnly}
        />

        {shared && (
          partnerOpen ? (
            <div className="v2-partner-open">
              <div className="v2-partner-head">
                <span className="v2-partner-name">{partnerName}</span>
                <button className="v2-header-btn" onClick={() => setPartnerOpen(false)} aria-label="Collapse partner logging">Close</button>
              </div>
              <ExerciseCardV2
                key={`v2-partner-${dateStr}-${ex.id}`}
                exercise={ex}
                sets={partnerSets}
                targetSets={target.sets}
                targetReps={target.reps}
                targetSeconds={target.seconds}
                ownerLabel={partnerName!}
                restMode={mode}
                shared={shared}
                lastSet={undefined}
                suggestion={null}
                onSave={savePartner}
                onSetComplete={() => startRest(partnerName!)}
                audioCtx={audioCtx}
                onAudioCtxInit={onAudioCtxInit}
                muted={muted}
                readOnly={readOnly}
              />
            </div>
          ) : (
            <button className="v2-partner-row" onClick={() => setPartnerOpen(true)}>
              <span>
                <span className="v2-partner-name">{partnerName}</span>
                <span className="v2-partner-sub">
                  set {Math.min(partnerLoggedSets + 1, target.sets)} of {target.sets}
                  {partnerLast ? ` · ${formatSide(partnerLast, ex)}` : ''}
                </span>
              </span>
              <span className="v2-partner-hint">tap to log for {partnerName}</span>
            </button>
          )
        )}

        {/* The safety cue, "felt easy" and the notes moved off the overview and
            live here, where you are actually doing the exercise. */}
        <div className="v2-extras">
          {ex.safetyCues.length > 0 && (
            <div className="v2-safety" role="note">
              {ex.safetyCues.includes('knee') && 'Knees track over toes, never cave inward. '}
              {ex.safetyCues.includes('back') && 'Hinge at hips, back stays flat.'}
            </div>
          )}
          <label className="v2-easy">
            <input type="checkbox" checked={selfFeltEasy} onChange={toggleFeltEasy} disabled={readOnly} />
            <span>Felt easy (suggest heavier next time)</span>
          </label>
          {ex.notes && <div className="v2-notes">{ex.notes}</div>}
          {ex.alternatives.length > 0 && <div className="v2-notes">Alt: {ex.alternatives.join(', ')}</div>}
        </div>
      </div>

      <RestDock
        lanes={lanes.lanes}
        targetKey={targetLane}
        onTarget={setTargetLane}
        youName={username}
        showNames={shared}
        onAdjust={lanes.adjust}
        onTogglePause={lanes.togglePause}
        onSkip={lanes.clear}
      />

      <div className="v2-nav">
        <button className="v2-nav-btn" style={{ flex: 1 }} disabled={idx === 0} onClick={goPrev} aria-label="Previous exercise">Prev</button>
        {!isLast ? (
          <button
            className={`v2-nav-btn v2-nav-next${allDone ? ' v2-nav-ready focus-next-ready' : ''}`}
            style={{ flex: 2 }}
            onClick={goNext}
            aria-label="Next exercise"
          >
            {allDone ? 'Next exercise →' : 'Next'}
          </button>
        ) : (
          <button
            className={`v2-nav-btn v2-nav-next${allDone ? ' v2-nav-ready focus-next-ready' : ''}`}
            style={{ flex: 2 }}
            onClick={() => {
              // Finishing clears every rest lane and stops the session clock —
              // an abandoned countdown that keeps ticking after the workout is
              // over is noise, and the elapsed time is meaningless once done.
              lanes.clearAll()
              onFinish()
              onClose()
            }}
            aria-label="Finish workout and mark the day done"
          >
            {allDone ? 'Finish ✓' : 'Finish'}
          </button>
        )}
      </div>
    </div>
  )
}
