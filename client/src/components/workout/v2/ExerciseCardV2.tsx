import { useState } from 'react'
import type { ExerciseDef, SetEntry } from '@letsgetbuff/shared'
import { ExerciseTimer } from '../timers'
import { formatDuration } from '../helpers'
import { clock, formatLoggedSet, formatSide, setComplete } from './helpers'
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
  /**
   * Seconds left on this person's rest lane, or null when not resting. While a
   * rest is running the card logs nothing at all — no fields, no timer, no log
   * button. The only way back in is to let it finish or skip it in the dock.
   */
  restRemaining?: number | null
  restPaused?: boolean
  suggestion: number | null
  onSave: (sets: SetEntry[]) => void
  /** A set just became complete — the caller starts the rest lane. */
  onSetComplete: (setIndex: number) => void
  audioCtx: AudioContext | null
  onAudioCtxInit: () => AudioContext
  muted: boolean
  readOnly?: boolean
  /**
   * Together mode: a second person logged from this same card. You lift at the
   * same time but not necessarily at the same weight, so each side keeps its own
   * kg / reps / RIR — the one confirm writes both and starts the one rest lane.
   */
  together?: {
    label: string
    sets: SetEntry[]
    suggestion: number | null
    lastSet?: SetEntry
    onSave: (sets: SetEntry[]) => void
  }
}

export default function ExerciseCardV2(props: ExerciseCardV2Props) {
  const {
    exercise, sets, targetSets, targetReps, targetSeconds, ownerLabel, restMode, shared,
    lastSet, suggestion, onSave, onSetComplete, audioCtx, onAudioCtxInit, muted, readOnly,
    restRemaining = null, restPaused = false, together,
  } = props

  const resting = restRemaining !== null && restRemaining > 0

  const [reopened, setReopened] = useState<number | null>(null)
  const [timingSet, setTimingSet] = useState<number | null>(null)
  const [draft, setDraft] = useState<{ kg: string; reps: string; rir: string } | null>(null)
  const [draft2, setDraft2] = useState<{ kg: string; reps: string; rir: string } | null>(null)

  const complete = Array.from({ length: Math.max(targetSets, sets.length) }, (_, i) => setComplete(sets[i], exercise))
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

  // The same three fields for the second person, off their own logged sets and
  // their own weight suggestion.
  const current2: SetEntry | undefined = together?.sets[currentIndex]
  const kg2Value = draft2?.kg ?? (current2?.kg !== undefined ? String(current2.kg) : together?.suggestion != null ? String(together.suggestion) : '')
  const reps2Value = draft2?.reps ?? (current2?.reps !== undefined ? String(current2.reps) : targetReps !== undefined ? String(targetReps) : '')
  const rir2Value = draft2?.rir ?? (current2?.rir !== undefined ? String(current2.rir) : '')

  const patch = (i: number, entry: SetEntry) => {
    const next = [...sets]
    while (next.length <= i) next.push({})
    next[i] = entry
    onSave(next)
    return next
  }

  // The second person's sets go to their own `onSave`; their completion never
  // re-triggers the rest lane, since the one confirm already started it.
  const writeSet2 = (i: number, entry: SetEntry) => {
    if (!together) return
    const next = [...together.sets]
    while (next.length <= i) next.push({})
    next[i] = entry
    together.onSave(next)
    setDraft2(null)
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
    if (together) {
      const entry2: SetEntry = { ...current2 }
      if (exercise.requiresKg) entry2.kg = kg2Value === '' ? undefined : Number(kg2Value)
      if (!timed) entry2.reps = reps2Value === '' ? undefined : Number(reps2Value)
      entry2.rir = rir2Value === '' ? undefined : Number(rir2Value)
      if (!timed && entry2.reps === undefined) return
      writeSet2(currentIndex, entry2)
    }
    writeSet(currentIndex, entry)
  }

  const logTimed = (achieved: number) => {
    const i = timingSet
    setTimingSet(null)
    if (i === null || readOnly) return
    const entry: SetEntry = { ...sets[i], seconds: achieved }
    if (exercise.requiresKg && kgValue !== '') entry.kg = Number(kgValue)
    if (together) {
      // One clock, two logs — you hold it at the same time, each at your own load.
      const entry2: SetEntry = { ...together.sets[i], seconds: achieved }
      if (exercise.requiresKg && kg2Value !== '') entry2.kg = Number(kg2Value)
      writeSet2(i, entry2)
    }
    writeSet(i, entry)
  }

  // Per-side halves write into the same SetEntry: the outer entry is the left
  // side, `.right` the right. One entry per logical set, so v1 still counts them.
  const mergeSide = (base: SetEntry, side: 'left' | 'right', halfEntry: SetEntry): SetEntry =>
    side === 'left'
      ? { ...base, ...halfEntry, right: base.right }
      : { ...base, right: { ...base.right, ...halfEntry } }

  const logSide = (side: 'left' | 'right', halfEntry: SetEntry) => {
    const base: SetEntry = { ...sets[currentIndex] }
    if (exercise.requiresKg && kgValue !== '') base.kg = Number(kgValue)
    writeSet(currentIndex, mergeSide(base, side, halfEntry))
  }

  const logSide2 = (side: 'left' | 'right', halfEntry: SetEntry) => {
    if (!together) return
    const base: SetEntry = { ...together.sets[currentIndex] }
    if (exercise.requiresKg && kg2Value !== '') base.kg = Number(kg2Value)
    writeSet2(currentIndex, mergeSide(base, side, halfEntry))
  }

  const primaryLabel = together
    ? `✓ Log set ${currentIndex + 1} for both · rest together`
    : restMode === 'together' && shared
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
                disabled={resting}
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
          <div className="v2-reopen-note">{formatLoggedSet(sets[reopened], exercise)}</div>
        )}

        {resting ? (
          <div className="v2-resting" role="status" aria-live="polite">
            <div className="v2-resting-clock">{clock(restRemaining!)}</div>
            {restPaused && <div className="v2-resting-txt">paused</div>}
          </div>
        ) : exercise.perSide ? (
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
                {together && (
                  <label className="v2-field-col">
                    <span className="v2-field-cap">{together.label.toUpperCase()} KG</span>
                    <input
                      type="number" inputMode="decimal" className="v2-field" min={0} step={0.5}
                      value={kg2Value}
                      onChange={e => setDraft2({ kg: e.target.value, reps: reps2Value, rir: rir2Value })}
                      aria-label={`Weight in kg for ${together.label}`}
                    />
                  </label>
                )}
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
              together={together ? {
                label: together.label,
                value: together.sets[currentIndex],
                onLogSide: logSide2,
              } : undefined}
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
            {together && exercise.requiresKg && (
              <div className="v2-fields">
                <label className="v2-field-col">
                  <span className="v2-field-cap">{together.label.toUpperCase()} KG</span>
                  <input
                    type="number" inputMode="decimal" className="v2-field" min={0} step={0.5}
                    value={kg2Value}
                    onChange={e => setDraft2({ kg: e.target.value, reps: reps2Value, rir: rir2Value })}
                    aria-label={`Weight in kg for ${together.label}`}
                  />
                </label>
              </div>
            )}
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
            {together && <div className="v2-who">{ownerLabel.toUpperCase()}</div>}
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

            {together && (
              <>
                <div className="v2-who v2-who-partner">
                  {together.label.toUpperCase()}
                  {together.lastSet && <span className="v2-last"> last {formatSide(together.lastSet, exercise)}</span>}
                </div>
                <div className="v2-fields">
                  {exercise.requiresKg && (
                    <label className="v2-field-col">
                      <span className="v2-field-cap">KG</span>
                      <input
                        type="number" inputMode="decimal" className="v2-field" min={0} step={0.5}
                        value={kg2Value}
                        onChange={e => setDraft2({ kg: e.target.value, reps: reps2Value, rir: rir2Value })}
                        aria-label={`Weight in kg for ${together.label}`}
                      />
                    </label>
                  )}
                  <label className="v2-field-col">
                    <span className="v2-field-cap">REPS</span>
                    <input
                      type="number" inputMode="numeric" className="v2-field" min={0}
                      value={reps2Value}
                      onChange={e => setDraft2({ kg: kg2Value, reps: e.target.value, rir: rir2Value })}
                      aria-label={`Reps for ${together.label}`}
                    />
                  </label>
                  <label className="v2-field-col">
                    <span className="v2-field-cap">RIR</span>
                    <input
                      type="number" inputMode="numeric" className="v2-field" min={0} max={10}
                      value={rir2Value}
                      onChange={e => setDraft2({ kg: kg2Value, reps: reps2Value, rir: e.target.value })}
                      aria-label={`Reps in reserve for ${together.label}`}
                    />
                  </label>
                </div>
              </>
            )}

            <button className="v2-primary" onClick={logCurrent} disabled={readOnly}>
              {reopened !== null ? `✓ Save set ${currentIndex + 1}` : primaryLabel}
            </button>
          </>
        )}

        {allDone && reopened === null && (
          <div className="v2-set-caption">all {targetSets} sets logged</div>
        )}
      </div>
    </div>
  )
}
