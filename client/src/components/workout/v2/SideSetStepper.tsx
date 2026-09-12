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
  /**
   * Together mode: the second person's half of the same side. You switch sides
   * at the same time, so one confirm logs the side for both — each at their own
   * reps, and on one shared clock when the exercise is timed.
   */
  together?: {
    label: string
    value: SetEntry | undefined
    onLogSide: (side: Side, half: SetEntry) => void
  }
}

export default function SideSetStepper(props: SideSetStepperProps) {
  const { exercise, setIndex, value, targetSeconds, targetReps, onLogSide, audioCtx, onAudioCtxInit, muted, readOnly, together } = props
  const [timingSide, setTimingSide] = useState<Side | null>(null)
  // Undefined = untouched, so the field falls back to the logged / target reps
  // the same way the non-per-side card does.
  const [reps, setReps] = useState<Partial<Record<Side, string>>>({})
  const [reps2, setReps2] = useState<Partial<Record<Side, string>>>({})
  // Set while re-timing one already-logged half, so it stays the active side
  // until its new value lands.
  const [redo, setRedo] = useState<Side | null>(null)

  const leftDone = sideLogged(value)
  const rightDone = sideLogged(value?.right)
  const timed = targetSeconds !== undefined

  const half = (side: Side): SetEntry | undefined => (side === 'left' ? value : value?.right)

  const half2 = (side: Side): SetEntry | undefined =>
    side === 'left' ? together?.value : together?.value?.right

  const logTimed = (side: Side, achieved: number) => {
    setTimingSide(null)
    if (readOnly) return
    setRedo(null)
    // One clock, both logs — you hold the same side at the same time.
    if (together) together.onLogSide(side, { ...half2(side), seconds: achieved })
    onLogSide(side, { ...half(side), seconds: achieved })
  }

  const repsValue = (side: Side): string =>
    reps[side] ?? (half(side)?.reps !== undefined ? String(half(side)!.reps) : targetReps !== undefined ? String(targetReps) : '')

  const reps2Value = (side: Side): string =>
    reps2[side] ?? (half2(side)?.reps !== undefined ? String(half2(side)!.reps) : targetReps !== undefined ? String(targetReps) : '')

  const logReps = (side: Side) => {
    if (readOnly) return
    const n = Number(repsValue(side))
    if (!Number.isFinite(n) || n <= 0) return
    if (together) {
      const n2 = Number(reps2Value(side))
      if (!Number.isFinite(n2) || n2 <= 0) return
      together.onLogSide(side, { ...half2(side), reps: n2 })
      setReps2(r => ({ ...r, [side]: undefined }))
    }
    setRedo(null)
    onLogSide(side, { ...half(side), reps: n })
    setReps(r => ({ ...r, [side]: undefined }))
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
          <div className="v2-side-achieved">
            <span className="v2-side-achieved-num">
              {formatSide(value, exercise)}
              {together && <> / {formatSide(together.value, exercise)}</>}
            </span>
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
          ▶ Start {active}{together ? ' for both' : ''} · {formatDuration(half(active)?.seconds ?? targetSeconds ?? 0)}
        </button>
      ) : together ? (
        <>
          <div className="v2-side-reps">
            <span className="v2-who">YOU</span>
            <input
              type="number"
              className="v2-field"
              inputMode="numeric"
              min={0}
              placeholder={String(targetReps ?? '')}
              value={repsValue(active)}
              onChange={e => setReps(r => ({ ...r, [active]: e.target.value }))}
              aria-label={`Reps for the ${active} side`}
            />
          </div>
          <div className="v2-side-reps">
            <span className="v2-who v2-who-partner">{together.label.toUpperCase()}</span>
            <input
              type="number"
              className="v2-field"
              inputMode="numeric"
              min={0}
              placeholder={String(targetReps ?? '')}
              value={reps2Value(active)}
              onChange={e => setReps2(r => ({ ...r, [active]: e.target.value }))}
              aria-label={`Reps for the ${active} side for ${together.label}`}
            />
          </div>
          <button className="v2-primary" onClick={() => logReps(active)} disabled={readOnly}>
            ✓ Log {active} for both
          </button>
        </>
      ) : (
        <div className="v2-side-reps">
          <input
            type="number"
            className="v2-field"
            inputMode="numeric"
            min={0}
            placeholder={String(targetReps ?? '')}
            value={repsValue(active)}
            onChange={e => setReps(r => ({ ...r, [active]: e.target.value }))}
            aria-label={`Reps for the ${active} side`}
          />
          <button className="v2-primary" onClick={() => logReps(active)} disabled={readOnly}>
            ✓ Log {active}
          </button>
        </div>
      )}
      {redo && <div className="v2-side-caption">redoing {redo}</div>}
    </div>
  )
}
