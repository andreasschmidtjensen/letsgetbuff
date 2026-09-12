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

export type WeightReason =
  | 'unweighted'  // bodyweight/timed — nothing to suggest
  | 'no-history'  // never logged with a weight
  | 'deload'      // long gap since the last time
  | 'hold'        // last time didn't feel easy
  | 'increment'   // last time felt easy

export interface WeightExplanation {
  reason: WeightReason
  weight: number | null
  lastWeight?: number
  increment?: number
  daysSinceLast?: number
}

/**
 * The weight suggestion together with the rule that produced it. This is the
 * single implementation — `suggestNextWeight` is the number-only view of it —
 * so the "Explain why" copy can never drift from what the app actually does.
 */
export function explainNextWeight(
  progressionType: ProgressionType,
  lastWeight: number | undefined,
  feltEasy: boolean,
  daysSinceLast?: number
): WeightExplanation {
  const inc = INCREMENT[progressionType]
  if (inc === null) return { reason: 'unweighted', weight: null }
  if (lastWeight === undefined) return { reason: 'no-history', weight: null, increment: inc }
  if (daysSinceLast !== undefined && daysSinceLast >= DELOAD_GAP_DAYS) {
    // ~90%, rounded to the loading increment, never above the old weight.
    const deloaded = Math.round((lastWeight * DELOAD_FACTOR) / inc) * inc
    const weight = Number(Math.max(inc, Math.min(lastWeight, deloaded)).toFixed(2))
    return { reason: 'deload', weight, lastWeight, increment: inc, daysSinceLast }
  }
  if (!feltEasy) return { reason: 'hold', weight: lastWeight, lastWeight, increment: inc, daysSinceLast }
  return { reason: 'increment', weight: lastWeight + inc, lastWeight, increment: inc, daysSinceLast }
}

export function suggestNextWeight(
  progressionType: ProgressionType,
  lastWeight: number | undefined,
  feltEasy: boolean,
  daysSinceLast?: number
): number | null {
  return explainNextWeight(progressionType, lastWeight, feltEasy, daysSinceLast).weight
}

/** One-sentence plain-English version of `explainNextWeight`, shared by v1 and v2. */
export function describeWeight(e: WeightExplanation): string {
  switch (e.reason) {
    case 'unweighted':
      return 'No weight to suggest - this one is bodyweight or timed, so progress comes from reps or seconds instead.'
    case 'no-history':
      return 'No suggestion yet: you have not logged this exercise with a weight before. Pick something you can control for every rep, and the next session will build on it.'
    case 'deload':
      return `It has been ${e.daysSinceLast} days since you last did this (${DELOAD_GAP_DAYS}+ counts as a break), so the suggestion drops to about 90% of your last ${e.lastWeight}kg. "Felt easy" climbs back at the normal +${e.increment}kg.`
    case 'hold':
      return `Same ${e.lastWeight}kg as last time, because you did not tick "felt easy". The weight only goes up when the last session felt easy - it never goes down on its own.`
    case 'increment':
      return `You ticked "felt easy" at ${e.lastWeight}kg last time, so this adds the standard +${e.increment}kg step for this kind of lift.`
  }
}

export interface RepExplanation {
  band: 1 | 2 | 3
  weekRange: string
  programWeek: number
  target: RepTarget
  banded: boolean
}

/** Why this exercise shows these sets/reps at this point in the program. */
export function explainRepTarget(exercise: ExerciseDef, programWeek: number): RepExplanation {
  const band = repBandFor(programWeek)
  return {
    band,
    weekRange: band === 1 ? 'weeks 1-8' : band === 2 ? 'weeks 9-16' : 'week 17 onwards',
    programWeek,
    target: repTargetFor(exercise, programWeek),
    banded: Boolean(exercise.repProgression),
  }
}

/** One-sentence plain-English version of `explainRepTarget`. */
export function describeRepTarget(e: RepExplanation): string {
  const amount = e.target.reps !== undefined ? `${e.target.reps} reps` : `${e.target.seconds}s`
  const head = `${e.target.sets} x ${amount}`
  if (!e.banded) {
    return `${head} is this exercise's fixed target - it has no rep progression, so it stays the same every week.`
  }
  return `You are in program week ${e.programWeek}, which is rep band ${e.band} (${e.weekRange}). That band sets this exercise to ${head}${e.target.addLoad ? ', with added load' : ''}. Later bands trade reps for heavier sets.`
}
