import { ExerciseDef, SetEntry, Session, repTargetFor } from '@letsgetbuff/shared'

// Pure helpers shared by the WorkoutView subtree (timers, logger, focus mode).
// Extracted from the former single WorkoutView.tsx so the God file could split.

// "45s", "10 min", or "1:30" — friendly label for a duration in seconds.
export function formatDuration(secs: number): string {
  if (secs >= 60) {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return s === 0 ? `${m} min` : `${m}:${s.toString().padStart(2, '0')}`
  }
  return `${secs}s`
}

// Parse a free-text warmup ("10-minute elliptical") into a label + duration so it
// can be run as a timed warm-up slide in focus mode. Defaults to 5 min if no number.
export function parseWarmup(raw: string | undefined): { label: string; seconds: number } | null {
  const text = raw?.trim()
  if (!text) return null
  const m = text.match(/(\d+)\s*-?\s*min/i)
  const minutes = m ? parseInt(m[1], 10) : 5
  return { label: text, seconds: Math.max(30, minutes * 60) }
}

export function lastSessionBefore(
  state: { sessions: Record<string, Session> },
  exerciseId: string,
  beforeDate: string
): { sets: SetEntry[]; feltEasy: boolean } | null {
  const dates = Object.keys(state.sessions).filter(d => d < beforeDate).sort().reverse()
  for (const date of dates) {
    const entry = state.sessions[date].entries[exerciseId]
    if (entry) return entry
  }
  return null
}

// Is this exercise fully logged for the given day in the given sessions blob?
// Mirrors the `confirmed` initialisation inside ExerciseLogger.
export function exerciseDoneIn(
  sessions: Record<string, Session>,
  dateStr: string,
  ex: ExerciseDef,
  programWeek: number,
): boolean {
  const target = repTargetFor(ex, programWeek)
  const logged = sessions[dateStr]?.entries[ex.id]?.sets ?? []
  const doneCount = logged.filter(s => s.reps !== undefined || s.seconds !== undefined).length
  return doneCount >= target.sets
}

export function formatSet(s: SetEntry, ex: ExerciseDef): string {
  const parts: string[] = []
  if (ex.requiresKg && s.kg !== undefined) parts.push(`${s.kg}kg`)
  if (s.reps !== undefined) parts.push(`x${s.reps}`)
  else if (s.seconds !== undefined) parts.push(`${s.seconds}s`)
  return parts.join(' ') || '-'
}

export function deltaLabel(
  current: SetEntry,
  prev: SetEntry | undefined,
  ex: ExerciseDef
): { text: string; positive: boolean } | null {
  if (!prev) return null
  if (ex.requiresKg && current.kg !== undefined && prev.kg !== undefined) {
    const d = current.kg - prev.kg
    if (d === 0) return null
    return { text: `${d > 0 ? '+' : ''}${d}kg`, positive: d > 0 }
  }
  if (!ex.requiresKg && current.reps !== undefined && prev.reps !== undefined) {
    const d = current.reps - prev.reps
    if (d === 0) return null
    return { text: `${d > 0 ? '+' : ''}${d} reps`, positive: d > 0 }
  }
  return null
}
