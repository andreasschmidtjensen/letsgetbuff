import { useState, useEffect } from 'react'
import { useStore } from '../../store/store'
import type { ExerciseDef, Session } from '@letsgetbuff/shared'
import TestModeBanner from '../TestModeBanner'
import { WarmupCard } from './timers'
import { ExerciseLogger } from './ExerciseLogger'
import { exerciseDoneIn } from './helpers'

interface FocusModeProps {
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
  /** Shared session: the partner's name + their sessions blob enable the dual logger. */
  partnerName?: string | null
  partnerState?: { sessions: Record<string, Session> } | null
  refreshPartner?: () => void
  /** Broadcast which exercise is focused (presence for a two-device shared session). */
  sendPresence?: (exerciseId: string) => void
  /** Optional timed warm-up shown as the first slide. */
  warmup?: { label: string; seconds: number } | null
}

const WARMUP_SLIDE = '__warmup__'

export default function FocusMode({ exercises, startIndex, dateStr, programWeek, audioCtx, onAudioCtxInit, onClose, readOnly, muted, restDefaultSecs, sessionId, workoutType, partnerName, partnerState, refreshPartner, sendPresence, warmup }: FocusModeProps) {
  const { state } = useStore()
  // Slides = optional warm-up + the plan exercises, navigated by id so a live
  // reorder can't teleport us.
  const slides = warmup ? [WARMUP_SLIDE, ...exercises.map(e => e.id)] : exercises.map(e => e.id)
  const [currentId, setCurrentId] = useState(slides[Math.min(Math.max(startIndex, 0), slides.length - 1)] ?? slides[0])
  const [warmupDone, setWarmupDone] = useState(false)

  let idx = slides.indexOf(currentId)
  if (idx === -1) idx = Math.min(startIndex, slides.length - 1)
  const onWarmup = slides[idx] === WARMUP_SLIDE
  const ex = onWarmup ? null : exercises.find(e => e.id === slides[idx])

  // Broadcast presence whenever the focused exercise changes (not for the warm-up).
  useEffect(() => {
    if (ex) sendPresence?.(ex.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId])

  if (!onWarmup && !ex) return null

  const shared = Boolean(partnerName && partnerState)
  let allDone: boolean
  if (onWarmup) {
    allDone = warmupDone
  } else {
    const selfDone = exerciseDoneIn(state.sessions, dateStr, ex!, programWeek)
    const partnerDone = shared ? exerciseDoneIn(partnerState!.sessions, dateStr, ex!, programWeek) : true
    allDone = selfDone && partnerDone
  }

  const goPrev = () => { if (idx > 0) setCurrentId(slides[idx - 1]) }
  const goNext = () => { if (idx < slides.length - 1) setCurrentId(slides[idx + 1]) }
  const isLast = idx >= slides.length - 1

  return (
    <div className="focus-overlay" role="dialog" aria-label="Focus workout mode" aria-modal="true">
      <TestModeBanner />
      <div className="focus-header">
        <button className="btn btn-secondary btn-sm" onClick={onClose} aria-label="Exit focus mode">Overview</button>
        <span className="muted" style={{ fontSize: 13 }}>{idx + 1} / {slides.length}</span>
        <div className="focus-progress-bar" aria-hidden="true">
          <div className="focus-progress-fill" style={{ width: `${((idx + 1) / slides.length) * 100}%` }} />
        </div>
      </div>

      <div className="focus-body">
        {onWarmup ? (
          <WarmupCard
            warmup={warmup!}
            done={warmupDone}
            onDone={() => setWarmupDone(true)}
            audioCtx={audioCtx}
            onAudioCtxInit={onAudioCtxInit}
            muted={muted}
          />
        ) : (
          <>
            <ExerciseLogger
              key={`focus-self-${dateStr}-${ex!.id}`}
              exercise={ex!}
              dateStr={dateStr}
              programWeek={programWeek}
              audioCtx={audioCtx}
              onAudioCtxInit={onAudioCtxInit}
              readOnly={readOnly}
              muted={muted}
              restDefaultSecs={restDefaultSecs}
              sessionId={sessionId}
              workoutType={workoutType}
              focus
              participantLabel={shared ? 'You' : undefined}
            />
            {shared && (
              <ExerciseLogger
                key={`focus-partner-${dateStr}-${ex!.id}`}
                exercise={ex!}
                dateStr={dateStr}
                programWeek={programWeek}
                audioCtx={audioCtx}
                onAudioCtxInit={onAudioCtxInit}
                readOnly={readOnly}
                muted={muted}
                restDefaultSecs={restDefaultSecs}
                sessionId={sessionId}
                workoutType={workoutType}
                focus
                participantLabel={partnerName!}
                proxyFor={partnerName!}
                dataState={partnerState!}
                onLogged={refreshPartner}
              />
            )}
          </>
        )}
      </div>

      <div className="focus-nav">
        <button className="btn btn-secondary" style={{ flex: 1 }} disabled={idx === 0}
          onClick={goPrev} aria-label="Previous">Prev</button>
        {!isLast ? (
          <button
            className={`btn ${allDone ? 'btn-primary focus-next-ready' : 'btn-secondary'}`}
            style={{ flex: 2 }}
            onClick={goNext}
            aria-label={onWarmup ? 'Start workout' : 'Next exercise'}
          >
            {allDone ? (onWarmup ? 'Start workout →' : 'Next exercise →') : 'Next'}
          </button>
        ) : (
          <button
            className={`btn ${allDone ? 'btn-primary focus-next-ready' : 'btn-secondary'}`}
            style={{ flex: 2 }}
            onClick={onClose}
            aria-label="Finish workout"
          >
            {allDone ? 'Finish ✓' : 'Finish'}
          </button>
        )}
      </div>
    </div>
  )
}
