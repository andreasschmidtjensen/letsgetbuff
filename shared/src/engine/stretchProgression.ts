import type { AppState, StretchLevelId } from '../types.js'
import { keyToDate } from '../lib/date.js'
import { BAND_REGRESS_GAP_DAYS } from './progression.js'

// The flexibility analogue of `suggestNextWeight`. Decides the level a user
// should perform *next* for a given stretch:
//   • default = the stretch's startLevel (no history yet)
//   • level up when the last 2 logged sessions at the current level were both
//     marked feltEasy — capped at 3
//   • since v52: a 28+ day break on the stretch drops the suggestion one level
//     (flexibility regresses with disuse); 2 sessions after the break restore
//     it — the same fast-return shape as the gym rep bands
//   • the manual "↓ easier / ↑ harder" control in the UI always wins
export const STRETCH_REBUILD_SESSIONS = 2
export const STRETCH_EASY_STREAK = 2

export interface StretchLevelInfo {
  /** The suggested level (earned level minus a possible break regression). */
  level: StretchLevelId
  /** The level the felt-easy history has earned. */
  earnedLevel: StretchLevelId
  /** Logged sessions of this stretch before today. */
  count: number
  /** Consecutive felt-easy sessions at the earned level (advance at 2). */
  easyStreak: number
  /** Present when a recent long break is holding the level one step down. */
  regressed?: { gapDays: number; sessionsSince: number; sessionsToRestore: number }
}

/** Full level suggestion with the reasoning — `suggestStretchLevel` is the
 *  number-only view, so the why panel can never drift from the behaviour. */
export function explainStretchLevel(
  state: Pick<AppState, 'stretchSessions'>,
  stretchId: string,
  startLevel: StretchLevelId,
  asOf?: string,
): StretchLevelInfo {
  // Sessions are keyed by ISO date, which sorts chronologically as strings.
  const dates = Object.keys(state.stretchSessions)
    .sort()
    .filter(d => (asOf === undefined || d < asOf) && Boolean(state.stretchSessions[d].entries[stretchId]))
  const logs = dates.map(d => state.stretchSessions[d].entries[stretchId])

  if (logs.length === 0) return { level: startLevel, earnedLevel: startLevel, count: 0, easyStreak: 0 }

  const current = logs[logs.length - 1].level
  const atCurrent = logs.filter(l => l.level === current)
  const lastTwo = atCurrent.slice(-2)
  const ready = lastTwo.length >= STRETCH_EASY_STREAK && lastTwo.every(l => l.feltEasy)
  const earned = (ready ? Math.min(3, current + 1) : current) as StretchLevelId
  const easyStreak = ready ? 0 : (atCurrent.length > 0 && atCurrent[atCurrent.length - 1].feltEasy ? 1 : 0)

  const info: StretchLevelInfo = { level: earned, earnedLevel: earned, count: logs.length, easyStreak }
  if (earned <= 1) return info

  // Break regression: most recent 28+ day gap, including "last session → today".
  const end = asOf ?? new Date().toISOString().slice(0, 10)
  const points = [...dates, end]
  for (let i = points.length - 1; i > 0; i--) {
    const gapDays = Math.round(
      (keyToDate(points[i]).getTime() - keyToDate(points[i - 1]).getTime()) / 86_400_000,
    )
    if (gapDays >= BAND_REGRESS_GAP_DAYS) {
      const sessionsSince = logs.length - i
      if (sessionsSince >= STRETCH_REBUILD_SESSIONS) break
      return {
        ...info,
        level: (earned - 1) as StretchLevelId,
        regressed: { gapDays, sessionsSince, sessionsToRestore: STRETCH_REBUILD_SESSIONS - sessionsSince },
      }
    }
  }
  return info
}

export function suggestStretchLevel(
  state: Pick<AppState, 'stretchSessions'>,
  stretchId: string,
  startLevel: StretchLevelId,
  asOf?: string,
): StretchLevelId {
  return explainStretchLevel(state, stretchId, startLevel, asOf).level
}

/** Plain-English version of `explainStretchLevel` for the why panel. */
export function describeStretchLevel(e: StretchLevelInfo): string {
  if (e.count === 0) {
    return `Every stretch starts at level ${e.level}. Two felt-easy sessions in a row at a level suggest the next one — never forced by the calendar.`
  }
  const times = e.count === 1 ? 'once' : `${e.count} times`
  if (e.regressed) {
    return (
      `You have logged this stretch ${times} and earned level ${e.earnedLevel}, but your last break on it was ` +
      `${e.regressed.gapDays} days (${BAND_REGRESS_GAP_DAYS}+ counts as a long break) — flexibility fades with disuse, so it runs one level lower for now. ` +
      `${e.regressed.sessionsToRestore} more session${e.regressed.sessionsToRestore === 1 ? '' : 's'} and level ${e.earnedLevel} is back.`
    )
  }
  const progress = e.level >= 3
    ? 'This is the top level.'
    : e.easyStreak > 0
      ? 'One more felt-easy session in a row suggests the next level.'
      : 'Two felt-easy sessions in a row suggest the next level.'
  return `You have logged this stretch ${times}; it is at level ${e.level}. ${progress} The ↓/↑ buttons override any day.`
}
