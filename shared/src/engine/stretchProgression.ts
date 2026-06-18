import type { AppState, StretchLevelId } from '../types.js'

// The flexibility analogue of `suggestNextWeight`. Decides the level a user
// should perform *next* for a given stretch:
//   • default = the stretch's startLevel (no history yet)
//   • level up when the last 2 logged sessions at the current level were both
//     marked feltEasy — capped at 3
//   • never auto-regress (a manual "↓ easier" control handles that in the UI)
//
// Sessions are keyed by ISO date, which sorts chronologically as strings.
export function suggestStretchLevel(
  state: AppState,
  stretchId: string,
  startLevel: StretchLevelId,
): StretchLevelId {
  const logs = Object.keys(state.stretchSessions)
    .sort()
    .map(d => state.stretchSessions[d].entries[stretchId])
    .filter((e): e is NonNullable<typeof e> => Boolean(e))

  if (logs.length === 0) return startLevel

  const current = logs[logs.length - 1].level
  const atCurrent = logs.filter(l => l.level === current)
  const lastTwo = atCurrent.slice(-2)
  const ready = lastTwo.length >= 2 && lastTwo.every(l => l.feltEasy)

  const next = ready ? Math.min(3, current + 1) : current
  return next as StretchLevelId
}
