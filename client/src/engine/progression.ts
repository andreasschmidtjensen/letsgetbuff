import type { ProgressionType } from '../types'
import type { ExerciseDef, RepTarget } from '../catalog/exercises'

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

export function suggestNextWeight(
  progressionType: ProgressionType,
  lastWeight: number | undefined,
  feltEasy: boolean
): number | null {
  const inc = INCREMENT[progressionType]
  if (inc === null) return null // bodyweight/timed: no weight suggestion
  if (lastWeight === undefined) return null // no history
  if (!feltEasy) return lastWeight // hold same weight
  return lastWeight + inc // never decrease
}
