import { useState } from 'react'
import type { ExerciseDef, SetEntry } from '@letsgetbuff/shared'
import { ExerciseTimer } from '../timers'
import { formatDuration } from '../helpers'
import { formatLoggedSet, formatSide, setComplete } from './helpers'
import SideSetStepper from './SideSetStepper'
import type { RestMode } from './restMode'

/**
 * One person's logging surface for the focused exercise: the done-set chips and
 * the current-set-large card.
 *
 * The card never shows an empty state for a set that has been logged — tapping
 * a chip re-opens that set with its values in the fields and, for a timed rep,
 * a `↻ Redo` that re-runs the countdown. That is the reported bug: v1's edit
 * mode dropped a timed set into a bare number input with no timer.
 */

interface ExerciseCardV2Props {
  exercise: ExerciseDef
  sets: SetEntry[]
  targetSets: number
  targetReps?: number
  targetSeconds?: number
  /** "YOU" / the partner's name — shown on the owner pill. */
  ownerLabel: string
  restMode: RestMode
  shared: boolean
  /** Previous session's matching set, for the "last 60kg ×10" reference. */
  lastSet?: SetEntry
  suggestion: number | null
  onSave: (sets: SetEntry[]) => void
  /** A set just became complete — the caller starts the rest lane. */
  onSetComplete: (setIndex: number) => void
  audioCtx: AudioContext | null
  onAudioCtxInit: () => AudioContext
  muted: boolean
  readOnly?: boolean
}

export default function ExerciseCardV2(props: ExerciseCardV2Props) {
  const {
    exercise, sets, targetSets, targetReps, targetSeconds, ownerLabel, restMode, shared,
    lastSet, suggestion, onSave, onSetComplete, audioCtx, onAudioCtxInit, muted, readOnly,
  } = props

  const [reopened, setReopened] = useState<number | null>(null)
  const [timingSet, setTimingSet] = useState<number | null>(null)
  const [draft, setDraft] = useState<{ kg: string; reps: string; rir: string } | null>(null)

  const complete = sets.map(s => setComplete(s, exercise))
  const firstOpen = complete.findIndex(c => !c)
  const currentIndex = reopened ?? (firstOpen === -1 ? targetSets - 1 : firstOpen)
  const current: SetEntry | undefined = sets[currentIndex]
  const timed = targetSeconds !== undefined
  const allDone = complete.length >= targetSets && complete.slice(0, targetSets).every(Boolean)

  // Field values: the draft while typing, otherwise what is logged, otherwise
  // the suggested weight / target reps.
  const kgValue = draft?.kg ?? (current?.kg !== undefined ? String(current.kg) : suggestion !== null ? String(suggestion) : '')
  const repsValue = draft?.reps ?? (current?.reps !== undefined ? String(current.reps) : targetReps !== undefined ? String(targetReps) : '')
  const rirValue = draft?.rir ?? (current?.rir !== undefined ? String(current.rir) : '')

  const patch = (i: number, entry: SetEntry) => {
    const next = [...sets]
    while (next.length <= i) next.push({})
    next[i] = entry
    onSave(next)
    return next
  }

  const writeSet = (i: number, entry: SetEntry) => {
    const before = setComplete(sets[i], exercise)
    patch(i, entry)
    setDraft(null)
    setReopened(null)
    if (!before && setComplete(entry, exercise)) onSetComplete(i)
  }

  const logCurrent = () => {
    if (readOnly) return
    const entry: SetEntry = { ...current }
    if (exercise.requiresKg) entry.kg = kgValue === '' ? undefined : Number(kgValue)
    if (!timed) entry.reps = repsValue === '' ? undefined : Number(repsValue)
    entry.rir = rirValue === '' ? undefined : Number(rirValue)
    if (!timed && entry.reps === undefined) return
    writeSet(currentIndex, entry)
  }

  const logTimed = (achieved: number) => {
    const i = timingSet
    setTimingSet(null)
    if (i === null || readOnly) return
    const entry: SetEntry = { ...sets[i], seconds: achieved }
    if (exercise.requiresKg && kgValue !== '') entry.kg = Number(kgValue)
    writeSet(i, entry)
  }

  // Per-side halves write into the same SetEntry: the outer entry is the left
  // side, `.right` the right. One entry per logical set, so v1 still counts them.
  const logSide = (side: 'left' | 'right', halfEntry: SetEntry) => {
    const base: SetEntry = { ...sets[currentIndex] }
    if (exercise.requiresKg && kgValue !== '') base.kg = Number(kgValue)
    const entry: SetEntry = side === 'left'
      ? { ...base, ...halfEntry, right: base.right }
      : { ...base, right: { ...base.right, ...halfEntry } }
    writeSet(currentIndex, entry)
  }

  const primaryLabel = restMode === 'together' && shared
    ? `✓ Log set ${currentIndex + 1} · rest together`
    : `✓ Log set ${currentIndex + 1} · start my rest`

  return (
    <div className="v2-log">
      {timingSet !== null && (
        <ExerciseTimer
          targetSecs={sets[timingSet]?.seconds ?? targetSeconds ?? 30}
          onComplete={logTimed}
          onCancel={() => setTimingSet(null)}
          audioCtx={audioCtx}
          onAudioCtxInit={onAudioCtxInit}
          muted={muted}
        />
      )}

      {/* Done-set chips — tap to re-open a set with its logged value. */}
      {complete.some(Boolean) && (
        <div className="v2-chips" role="group" aria-label="Logged sets">
          {sets.slice(0, targetSets).map((s, i) => (
            complete[i] ? (
              <button
                key={i}
                className={`v2-chip${reopened === i ? ' v2-chip-open' : ''}`}
                onClick={() => { setReopened(reopened === i ? null : i); setDraft(null) }}
                aria-label={`Set ${i + 1}: ${formatLoggedSet(s, exercise)}. Tap to re-open.`}
              >
                {i + 1} ✓ {formatLoggedSet(s, exercise)}
              </button>
            ) : null
          ))}
        </div>
      )}

      <div className="v2-set-card">
        <div className="v2-set-head">
          <span className="v2-owner-pill">{ownerLabel.toUpperCase()} · SET {currentIndex + 1} OF {targetSets}</span>
          {lastSet && <span className="v2-last">last {formatSide(lastSet, exercise)}</span>}
        </div>

        {reopened !== null && (
          <div className="v2-reopen-note">
            Re-opened set {reopened + 1} — logged {formatLoggedSet(sets[reopened], exercise)}
          </div>
        )}

        {exercise.perSide ? (
          <>
            {exercise.requiresKg && (
              <div className="v2-fields">
                <label className="v2-field-col">
                  <span className="v2-field-cap">KG</span>
                  <input
                    type="number" inputMode="decimal" className="v2-field" min={0} step={0.5}
                    value={kgValue}
                    onChange={e => setDraft(d => ({ kg: e.target.value, reps: d?.reps ?? repsValue, rir: d?.rir ?? rirValue }))}
                    aria-label="Weight in kg"
                  />
                </label>
              </div>
            )}
            <SideSetStepper
              exercise={exercise}
              setIndex={currentIndex}
              totalSets={targetSets}
              value={current}
              targetSeconds={targetSeconds}
              targetReps={targetReps}
              onLogSide={logSide}
              audioCtx={audioCtx}
              onAudioCtxInit={onAudioCtxInit}
              muted={muted}
              readOnly={readOnly}
            />
          </>
        ) : timed ? (
          <>
            <div className="v2-fields">
              {exercise.requiresKg && (
                <label className="v2-field-col">
                  <span className="v2-field-cap">KG</span>
                  <input
                    type="number" inputMode="decimal" className="v2-field" min={0} step={0.5}
                    value={kgValue}
                    onChange={e => setDraft(d => ({ kg: e.target.value, reps: d?.reps ?? repsValue, rir: d?.rir ?? rirValue }))}
                    aria-label="Weight in kg"
                  />
                </label>
              )}
              <label className="v2-field-col">
                <span className="v2-field-cap">SECONDS</span>
                <input
                  type="number" inputMode="numeric" className="v2-field" min={0}
                  value={current?.seconds !== undefined ? String(current.seconds) : ''}
                  onChange={e => patch(currentIndex, { ...current, seconds: e.target.value === '' ? undefined : Number(e.target.value) })}
                  aria-label="Seconds (manual entry)"
                />
              </label>
            </div>
            <button
              className="v2-primary"
              onClick={() => setTimingSet(currentIndex)}
              disabled={readOnly}
              aria-label={`Start the timer for set ${currentIndex + 1}`}
            >
              {complete[currentIndex] ? '↻ Redo' : '▶ Start'} set {currentIndex + 1} · {formatDuration(current?.seconds ?? targetSeconds ?? 0)}
            </button>
          </>
        ) : (
          <>
            <div className="v2-fields">
              {exercise.requiresKg && (
                <label className="v2-field-col">
                  <span className="v2-field-cap">KG</span>
                  <input
                    type="number" inputMode="decimal" className="v2-field" min={0} step={0.5}
                    value={kgValue}
                    onChange={e => setDraft({ kg: e.target.value, reps: repsValue, rir: rirValue })}
                    aria-label="Weight in kg"
                  />
                </label>
              )}
              <label className="v2-field-col">
                <span className="v2-field-cap">REPS</span>
                <input
                  type="number" inputMode="numeric" className="v2-field" min={0}
                  value={repsValue}
                  onChange={e => setDraft({ kg: kgValue, reps: e.target.value, rir: rirValue })}
                  aria-label="Reps"
                />
              </label>
              <label className="v2-field-col">
                <span className="v2-field-cap">RIR</span>
                <input
                  type="number" inputMode="numeric" className="v2-field" min={0} max={10}
                  value={rirValue}
                  onChange={e => setDraft({ kg: kgValue, reps: repsValue, rir: e.target.value })}
                  aria-label="Reps in reserve"
                />
              </label>
            </div>
            <button className="v2-primary" onClick={logCurrent} disabled={readOnly}>
              {reopened !== null ? `✓ Save set ${currentIndex + 1}` : primaryLabel}
            </button>
          </>
        )}

        {allDone && reopened === null && (
          <div className="v2-set-caption">All {targetSets} sets logged — tap a chip to change one.</div>
        )}
      </div>
    </div>
  )
}
