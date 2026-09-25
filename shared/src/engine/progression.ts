import type { ProgressionType, Session } from '../types.js'
import type { ExerciseDef, RepTarget } from '../catalog/exercises.js'
import { hasRealSet } from './history.js'
import { keyToDate } from '../lib/date.js'

// Minimum increment per progression type after "felt easy". Exported readonly
// so the Program Guide renders the real table and cannot drift from the rule.
export const INCREMENTS: Readonly<Record<ProgressionType, number | null>> = {
  dumbbell: 1,   // +1-2 kg (use lower bound)
  legPress: 5,   // +5-10 kg (use lower bound)
  rdl: 2.5,      // fixed +2.5 kg
  cable: 2.5,    // +2.5-5 kg (use lower bound)
  bodyweight: null,
  timed: null,
}
const INCREMENT = INCREMENTS

// ---- Rep bands: follow the training, not the calendar (v51) ----------------
//
// A band is earned PER EXERCISE by how many times it has actually been logged:
// your 1st-8th session of an exercise is band 1, 9th-16th band 2, 17th+ band 3.
// On the nominal twice-a-week schedule each exercise comes up about once a
// week, so these boundaries match the old week-8/week-16 ones — but time that
// passes without training no longer advances anything, an exercise added late
// ramps on its own clock, and training more often advances faster.
export const BAND2_FROM_SESSION = 9
export const BAND3_FROM_SESSION = 17

// A long break on an exercise drops it one band — heavy low-rep sets are the
// wrong way back in. Re-earning is deliberately fast: a few sessions restore
// the earned band, not the eight it took originally. (Weight has its own,
// shorter comeback rule: the 14-day ~90% deload below.)
export const BAND_REGRESS_GAP_DAYS = 28
export const BAND_REBUILD_SESSIONS = 3

function bandForSessionNumber(n: number): 1 | 2 | 3 {
  if (n < BAND2_FROM_SESSION) return 1
  if (n < BAND3_FROM_SESSION) return 2
  return 3
}

export interface ExerciseBandInfo {
  /** The band in effect (countBand, minus a possible break regression). */
  band: 1 | 2 | 3
  /** Sessions of this exercise logged before `asOf`. */
  count: number
  /** The band the count alone has earned. */
  countBand: 1 | 2 | 3
  /** Present when a recent long break is holding the band one step down. */
  regressed?: { gapDays: number; sessionsSince: number; sessionsToRestore: number }
}

/**
 * The rep band for one exercise on one day, from the user's own history.
 * `asOf` is the session date (YYYY-MM-DD); only sessions strictly before it
 * count, so logging today never changes today's own target mid-session.
 */
export function exerciseRepBand(
  sessions: Record<string, Session>,
  exerciseId: string,
  asOf: string,
): ExerciseBandInfo {
  const dates = Object.keys(sessions ?? {})
    .filter(d => {
      if (d >= asOf) return false
      const entry = sessions[d]?.entries?.[exerciseId]
      return Boolean(entry && hasRealSet(entry))
    })
    .sort()
  const count = dates.length
  const countBand = bandForSessionNumber(count + 1)
  if (countBand === 1) return { band: 1, count, countBand }

  // Most recent gap of BAND_REGRESS_GAP_DAYS+ (including "last session → asOf")
  // and the number of sessions logged since it.
  const points = [...dates, asOf]
  for (let i = points.length - 1; i > 0; i--) {
    const gapDays = Math.round(
      (keyToDate(points[i]).getTime() - keyToDate(points[i - 1]).getTime()) / 86_400_000,
    )
    if (gapDays >= BAND_REGRESS_GAP_DAYS) {
      const sessionsSince = count - i
      if (sessionsSince >= BAND_REBUILD_SESSIONS) break
      return {
        band: (countBand - 1) as 1 | 2,
        count,
        countBand,
        regressed: { gapDays, sessionsSince, sessionsToRestore: BAND_REBUILD_SESSIONS - sessionsSince },
      }
    }
  }
  return { band: countBand, count, countBand }
}

export function repTargetFor(exercise: ExerciseDef, band: 1 | 2 | 3): RepTarget {
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
export const DELOAD_FACTOR = 0.9

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
  count: number
  countBand: 1 | 2 | 3
  target: RepTarget
  banded: boolean
  /** True when this session is the first in a newly earned higher band. */
  justAdvanced: boolean
  regressed?: ExerciseBandInfo['regressed']
  /** Authored note on why this exercise's rep scheme deviates (from `rationale.repScheme`). */
  note?: string
}

/** Why this exercise shows these sets/reps, from its own training history. */
export function explainRepTarget(exercise: ExerciseDef, info: ExerciseBandInfo): RepExplanation {
  const n = info.count + 1
  return {
    band: info.band,
    count: info.count,
    countBand: info.countBand,
    target: repTargetFor(exercise, info.band),
    banded: Boolean(exercise.repProgression),
    justAdvanced: !info.regressed && (n === BAND2_FROM_SESSION || n === BAND3_FROM_SESSION),
    regressed: info.regressed,
    note: exercise.rationale?.repScheme,
  }
}

function bandRange(band: 1 | 2 | 3): string {
  return band === 1
    ? `sessions 1-${BAND2_FROM_SESSION - 1}`
    : band === 2
      ? `sessions ${BAND2_FROM_SESSION}-${BAND3_FROM_SESSION - 1}`
      : `session ${BAND3_FROM_SESSION} onwards`
}

/** Plain-English version of `explainRepTarget`, shared by v1, v2 and the guide. */
export function describeRepTarget(e: RepExplanation): string {
  const amount = e.target.reps !== undefined ? `${e.target.reps} reps` : `${e.target.seconds}s`
  const head = `${e.target.sets} x ${amount}`
  const note = e.note ? ` ${e.note}` : ''
  if (!e.banded) {
    return `${head} is this exercise's fixed target - it has no rep progression, so it stays the same every session.${note}`
  }
  const times = e.count === 1 ? 'once' : `${e.count} times`
  if (e.regressed) {
    return (
      `You have logged this exercise ${times}, which earns rep band ${e.countBand} - but your last break on it was ` +
      `${e.regressed.gapDays} days (${BAND_REGRESS_GAP_DAYS}+ counts as a long break), so it runs one band lower for now: ${head}` +
      `${e.target.addLoad ? ', with added load' : ''}. ` +
      `${e.regressed.sessionsToRestore} more session${e.regressed.sessionsToRestore === 1 ? '' : 's'} and band ${e.countBand} is back.${note}`
    )
  }
  const advanced = e.justAdvanced
    ? ' New band: the rep range just dropped, so consider adding about 10% weight.'
    : ''
  return (
    `You have logged this exercise ${times}, so today (number ${e.count + 1}) is in rep band ${e.band} ` +
    `(${bandRange(e.band)}): ${head}${e.target.addLoad ? ', with added load' : ''}. ` +
    `Bands follow how much you train each exercise, not the calendar - later bands trade reps for heavier sets.${advanced}${note}`
  )
}
