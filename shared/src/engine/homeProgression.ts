import type { AppState, StretchLevelId } from '../types.js'
import { keyToDate } from '../lib/date.js'
import { BAND_REGRESS_GAP_DAYS } from './progression.js'

// Harder-variant suggestions for the home circuit — the exact model the
// stretch levels use, driven by the whole-circuit "felt easy" tick that the
// finish screen records on each ActivityEntry:
//   • default = level 1 (no circuit history for that exercise)
//   • level up when the last 2 circuits at the current level both felt easy
//   • a 28+ day break since the last circuit drops the suggestion one level;
//     2 circuits after the break restore it (fast return, like the gym bands)
//   • the per-exercise ↑/↓ override in the UI always wins for that session
export const HOME_REBUILD_SESSIONS = 2
export const HOME_EASY_STREAK = 2

export interface HomeLevelInfo {
  /** The suggested level (earned level minus a possible break regression). */
  level: StretchLevelId
  /** The level the felt-easy history has earned. */
  earnedLevel: StretchLevelId
  /** Completed home circuits that included this exercise, before `asOf`. */
  count: number
  /** Consecutive felt-easy circuits at the earned level (advance at 2). */
  easyStreak: number
  /** Present when a recent long break is holding the level one step down. */
  regressed?: { gapDays: number; sessionsSince: number; sessionsToRestore: number }
}

interface CircuitLog { date: string; level: StretchLevelId; feltEasy: boolean }

function circuitLogs(state: Pick<AppState, 'activities'>, exerciseId: string, asOf: string): CircuitLog[] {
  const logs: CircuitLog[] = []
  for (const date of Object.keys(state.activities ?? {}).sort()) {
    if (date >= asOf) continue
    for (const a of state.activities[date] ?? []) {
      if (a?.type !== 'home') continue
      // Circuits logged before v52 carry no levels: they count as level 1,
      // never felt-easy — history is preserved, progression starts fresh.
      logs.push({
        date,
        level: (a.levels?.[exerciseId] ?? 1) as StretchLevelId,
        feltEasy: a.feltEasy === true,
      })
    }
  }
  return logs
}

/** The suggested variant level for one home exercise on one day. */
export function explainHomeLevel(
  state: Pick<AppState, 'activities'>,
  exerciseId: string,
  asOf: string,
): HomeLevelInfo {
  const logs = circuitLogs(state, exerciseId, asOf)
  if (logs.length === 0) return { level: 1, earnedLevel: 1, count: 0, easyStreak: 0 }

  // Earned level: walk the history applying the 2-easy-in-a-row rule, so the
  // suggestion is reproducible from the log alone (same as stretches).
  let earned: StretchLevelId = 1
  let streak = 0
  for (const log of logs) {
    if (log.level >= earned && log.feltEasy) {
      streak += 1
      if (streak >= HOME_EASY_STREAK && earned < 3) {
        earned = (earned + 1) as StretchLevelId
        streak = 0
      }
    } else {
      streak = 0
    }
    // A manual jump above the earned level counts as earning it: you did the
    // harder variant for a full circuit.
    if (log.level > earned) { earned = log.level; streak = log.feltEasy ? 1 : 0 }
  }

  const info: HomeLevelInfo = { level: earned, earnedLevel: earned, count: logs.length, easyStreak: streak }
  if (earned === 1) return info

  // Break regression: gap from the last circuit (or between circuits) of
  // BAND_REGRESS_GAP_DAYS+, with HOME_REBUILD_SESSIONS circuits to restore.
  const points = [...logs.map(l => l.date), asOf]
  for (let i = points.length - 1; i > 0; i--) {
    const gapDays = Math.round(
      (keyToDate(points[i]).getTime() - keyToDate(points[i - 1]).getTime()) / 86_400_000,
    )
    if (gapDays >= BAND_REGRESS_GAP_DAYS) {
      const sessionsSince = logs.length - i
      if (sessionsSince >= HOME_REBUILD_SESSIONS) break
      return {
        ...info,
        level: (earned - 1) as StretchLevelId,
        regressed: { gapDays, sessionsSince, sessionsToRestore: HOME_REBUILD_SESSIONS - sessionsSince },
      }
    }
  }
  return info
}

export function suggestHomeLevel(
  state: Pick<AppState, 'activities'>,
  exerciseId: string,
  asOf: string,
): StretchLevelId {
  return explainHomeLevel(state, exerciseId, asOf).level
}

/** Plain-English version of `explainHomeLevel` for the why panel. */
export function describeHomeLevel(e: HomeLevelInfo): string {
  if (e.count === 0) {
    return 'Every exercise starts at its easiest variant. Tick "felt easy" after a circuit; two easy circuits in a row suggest the harder variant.'
  }
  const circuits = e.count === 1 ? 'one circuit' : `${e.count} circuits`
  if (e.regressed) {
    return (
      `Your history (${circuits}) has earned variant level ${e.earnedLevel}, but your last break was ` +
      `${e.regressed.gapDays} days (${BAND_REGRESS_GAP_DAYS}+ counts as a long break), so it runs one level lower for now. ` +
      `${e.regressed.sessionsToRestore} more circuit${e.regressed.sessionsToRestore === 1 ? '' : 's'} and level ${e.earnedLevel} is back.`
    )
  }
  const progress = e.level >= 3
    ? 'This is the top variant.'
    : e.easyStreak > 0
      ? `${HOME_EASY_STREAK - e.easyStreak} more felt-easy circuit${HOME_EASY_STREAK - e.easyStreak === 1 ? '' : 's'} in a row suggests the harder variant.`
      : `Two felt-easy circuits in a row suggest the harder variant.`
  return `You have finished ${circuits}; this exercise is at variant level ${e.level}. ${progress}`
}
