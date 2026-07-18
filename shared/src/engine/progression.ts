import type { ProgressionType } from '../types.js'
import type { ExerciseDef, RepTarget } from '../catalog/exercises.js'

// Minimum increment per progression type after "felt easy"
const INCREMENT: Record<ProgressionType, number | null> = {
  dumbbell: 1,   // +1-2 kg (use lower bound)
  legPress: 5,   // +5-10 kg (use lower bound)
  rdl: 2.5,      // fixed +2.5 kg
  cable: 2.5,    // +2.5-5 kg (use lower bound)
  bodyweight: null,
  timed: null,
}

// Rep-band boundaries differ from schedule phase boundaries (8/16 vs 4/16)
export function repBandFor(week: number): 1 | 2 | 3 {
  if (week <= 8) return 1
  if (week <= 16) return 2
  return 3
}

export function repTargetFor(exercise: ExerciseDef, programWeek: number): RepTarget {
  const band = repBandFor(programWeek)
  if (!exercise.repProgression) {
    return {
      sets: exercise.sets,
      reps: exercise.reps !== null ? exercise.reps : undefined,
      seconds: exercise.seconds,
    }
  }
  return exercise.repProgression[`band${band}` as 'band1' | 'band2' | 'band3']
}

// After a training gap the last working weight is usually too heavy to resume
// at. From this many days since the exercise was last logged, suggest a deload
// instead; "felt easy" then climbs back at the normal increment.
export const DELOAD_GAP_DAYS = 14
const DELOAD_FACTOR = 0.9

export function suggestNextWeight(
  progressionType: ProgressionType,
  lastWeight: number | undefined,
  feltEasy: boolean,
  daysSinceLast?: number
): number | null {
  const inc = INCREMENT[progressionType]
  if (inc === null) return null // bodyweight/timed: no weight suggestion
  if (lastWeight === undefined) return null // no history
  if (daysSinceLast !== undefined && daysSinceLast >= DELOAD_GAP_DAYS) {
    // ~90%, rounded to the loading increment, never above the old weight.
    const deloaded = Math.round((lastWeight * DELOAD_FACTOR) / inc) * inc
    return Number(Math.max(inc, Math.min(lastWeight, deloaded)).toFixed(2))
  }
  if (!feltEasy) return lastWeight // hold same weight
  return lastWeight + inc // never decrease
}
