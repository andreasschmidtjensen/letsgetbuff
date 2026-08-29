import { useState } from 'react'
import type { ExerciseDef, SetEntry } from '@letsgetbuff/shared'
import { ExerciseTimer } from '../timers'
import { formatDuration } from '../helpers'
import { formatSide, sideLogged } from './helpers'

/**
 * A per-side set: one set with two halves. Left → "switch sides" → Right, and
 * the set only counts when both are logged.
 *
 * Every logged half keeps a `↻ Redo` button. That is the fix for the reported
 * bug: re-opening a completed timed rep used to drop you into a bare number
 * input with no way to re-run the countdown.
 */

type Side = 'left' | 'right'

interface SideSetStepperProps {
  exercise: ExerciseDef
  setIndex: number
  totalSets: number
  /** The logged set so far: the outer entry is the left half, `.right` the right. */
  value: SetEntry | undefined
  targetSeconds?: number
  targetReps?: number
  onLogSide: (side: Side, half: SetEntry) => void
  audioCtx: AudioContext | null
  onAudioCtxInit: () => AudioContext
  muted: boolean
  readOnly?: boolean
}

export default function SideSetStepper(props: SideSetStepperProps) {
  const { exercise, setIndex, totalSets, value, targetSeconds, targetReps, onLogSide, audioCtx, onAudioCtxInit, muted, readOnly } = props
  const [timingSide, setTimingSide] = useState<Side | null>(null)
  const [reps, setReps] = useState<Record<Side, string>>({ left: '', right: '' })
  // Set while re-timing one already-logged half, so it stays the active side
  // until its new value lands.
  const [redo, setRedo] = useState<Side | null>(null)

  const leftDone = sideLogged(value)
  const rightDone = sideLogged(value?.right)
  const doneCount = (leftDone ? 1 : 0) + (rightDone ? 1 : 0)
  const timed = targetSeconds !== undefined

  const half = (side: Side): SetEntry | undefined => (side === 'left' ? value : value?.right)

  const logTimed = (side: Side, achieved: number) => {
    setTimingSide(null)
    if (readOnly) return
    setRedo(null)
    onLogSide(side, { ...half(side), seconds: achieved })
  }

  const logReps = (side: Side) => {
    if (readOnly) return
    const n = Number(reps[side])
    if (!Number.isFinite(n) || n <= 0) return
    setRedo(null)
    onLogSide(side, { ...half(side), reps: n })
    setReps(r => ({ ...r, [side]: '' }))
  }

  // Which side is being worked now: the first not yet logged, or the one being redone.
  const active: Side | null = redo ?? (!leftDone ? 'left' : !rightDone ? 'right' : null)

  const chips = (
    <div className="v2-side-chips" role="group" aria-label="Side">
      {(['left', 'right'] as Side[]).map(s => (
        <span key={s} className={`v2-side-chip${active === s ? ' v2-side-chip-on' : ''}`}>
          {s.toUpperCase()}
        </span>
      ))}
    </div>
  )

  const timerOverlay = timingSide && (
    <ExerciseTimer
      targetSecs={half(timingSide)?.seconds ?? targetSeconds ?? 30}
      onComplete={achieved => logTimed(timingSide, achieved)}
      onCancel={() => setTimingSide(null)}
      audioCtx={audioCtx}
      onAudioCtxInit={onAudioCtxInit}
      muted={muted}
    />
  )

  // Both sides logged: show what was logged, each half re-runnable on its own.
  if (active === null) {
    return (
      <div className="v2-side-block">
        {timerOverlay}
        {(['left', 'right'] as Side[]).map(s => (
          <div key={s} className="v2-side-row">
            <span className="v2-side-row-label">{s.toUpperCase()}</span>
            <span className="v2-side-row-val">{formatSide(half(s), exercise)}</span>
            <button
              className="v2-redo"
              onClick={() => { setRedo(s); if (timed) setTimingSide(s) }}
              aria-label={`Redo the ${s} side of set ${setIndex + 1}`}
              disabled={readOnly}
            >
              ↻ Redo
            </button>
          </div>
        ))}
      </div>
    )
  }

  const isStepTwo = active === 'right' && leftDone && !redo

  return (
    <div className="v2-side-block">
      {timerOverlay}
      {isStepTwo && (
        <div className="v2-side-switch">
          <div className="v2-side-step">STEP 2 · SWITCH SIDES</div>
          <div className="v2-side-achieved">
            <span className="v2-side-achieved-num">{formatSide(value, exercise)}</span>
            <span className="v2-side-achieved-txt">left logged<br />now the other side</span>
          </div>
        </div>
      )}
      {chips}
      {timed ? (
        <button
          className="v2-primary"
          onClick={() => setTimingSide(active)}
          disabled={readOnly}
          aria-label={`Start the ${active} side timer for set ${setIndex + 1}`}
        >
          ▶ Start {active} · {formatDuration(half(active)?.seconds ?? targetSeconds ?? 0)}
        </button>
      ) : (
        <div className="v2-side-reps">
          <input
            type="number"
            className="v2-field"
            inputMode="numeric"
            min={0}
            placeholder={String(targetReps ?? '')}
            value={reps[active]}
            onChange={e => setReps(r => ({ ...r, [active]: e.target.value }))}
            aria-label={`Reps for the ${active} side`}
          />
          <button className="v2-primary" onClick={() => logReps(active)} disabled={readOnly}>
            ✓ Log {active}
          </button>
        </div>
      )}
      <div className="v2-side-caption">
        {redo
          ? `redoing the ${redo} side · only that value changes`
          : `set ${setIndex + 1} of ${totalSets} · ${doneCount} of 2 sides logged`}
        {!redo && doneCount === 1 ? ' · no rest until both sides are done' : ''}
      </div>
    </div>
  )
}
