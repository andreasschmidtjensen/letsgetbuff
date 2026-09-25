import { useState } from 'react'
import {
  describeExerciseChoice,
  describeLoadMode,
  describeRepTarget,
  describeWeight,
  explainNextWeight,
  explainRepTarget,
} from '@letsgetbuff/shared'
import type { ExerciseDef, ExerciseBandInfo } from '@letsgetbuff/shared'

/**
 * "Explain why" — the reasoning behind today's exercise, its rep target and its
 * suggested weight. Every sentence comes from the engine functions that produce
 * the numbers, so the explanation cannot drift from the actual behaviour.
 *
 * Used by both the v1 logger and the v2 focus screen.
 */

interface ExplainWhyProps {
  exercise: ExerciseDef
  /** Still drives the minWeek text in "why this exercise". */
  programWeek: number
  /** This exercise's session-count band (from `exerciseRepBand`). */
  bandInfo: ExerciseBandInfo
  loggedIds?: ReadonlySet<string>
  lastWeight?: number
  feltEasy: boolean
  daysSinceLast?: number
  /** `compact` is the v2 title-row variant: icon only, panel below. */
  compact?: boolean
}

export default function ExplainWhy(props: ExplainWhyProps) {
  const { exercise, programWeek, bandInfo, loggedIds, lastWeight, feltEasy, daysSinceLast, compact } = props
  const [open, setOpen] = useState(false)
  const panelId = `explain-${exercise.id}`

  const weight = explainNextWeight(exercise.progressionType, lastWeight, feltEasy, daysSinceLast)
  const reps = explainRepTarget(exercise, bandInfo)
  const loadNote = describeLoadMode(exercise)

  return (
    <>
      <button
        className={compact ? 'v2-form-btn explain-btn' : 'btn btn-sm btn-secondary explain-btn'}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Explain why ${exercise.name} looks like this`}
        title="Explain why"
      >
        {compact ? '?' : open ? 'Hide why' : '? Why'}
      </button>
      {open && (
        <div id={panelId} className="explain-panel" role="note">
          <p><strong>Why this exercise</strong><br />{describeExerciseChoice(exercise, programWeek, loggedIds)}</p>
          <p><strong>Why these sets and reps</strong><br />{describeRepTarget(reps)}</p>
          <p><strong>Why this weight</strong><br />{describeWeight(weight)}</p>
          {loadNote && <p><strong>How to read the weight</strong><br />{loadNote}</p>}
          {exercise.notes && <p><strong>Form</strong><br />{exercise.notes}</p>}
        </div>
      )}
    </>
  )
}
