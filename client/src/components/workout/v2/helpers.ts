import { ExerciseDef, SetEntry, Session, repTargetFor } from '@letsgetbuff/shared'

// Pure helpers for the v2 workout screens. v1's `./helpers` stays untouched —
// these differ only where per-side sets change the arithmetic.

/** Does this half of a set carry a logged value? */
export function sideLogged(s: SetEntry | undefined): boolean {
  return Boolean(s && (s.reps !== undefined || s.seconds !== undefined))
}

/**
 * Is a set complete? A per-side exercise needs both halves; everything else
 * needs the one value, exactly as v1 counts it.
 */
export function setComplete(s: SetEntry | undefined, ex: ExerciseDef): boolean {
  if (!sideLogged(s)) return false
  return ex.perSide ? sideLogged(s!.right) : true
}

/**
 * v2's `exerciseDoneIn`: same contract as v1's, but a per-side exercise only
 * counts a set once BOTH sides are logged. Reading the same `sets` array means
 * a session started on v1 still reports correctly here.
 */
export function exerciseDoneInV2(
  sessions: Record<string, Session>,
  dateStr: string,
  ex: ExerciseDef,
  programWeek: number,
): boolean {
  const target = repTargetFor(ex, programWeek)
  const logged = sessions[dateStr]?.entries[ex.id]?.sets ?? []
  return logged.filter(s => setComplete(s, ex)).length >= target.sets
}

/** How many sides of this set are logged (0-2). Non-per-side exercises: 0 or 1. */
export function sidesLogged(s: SetEntry | undefined, ex: ExerciseDef): number {
  if (!sideLogged(s)) return 0
  return ex.perSide && sideLogged(s!.right) ? 2 : 1
}

/** "60kg ×10" / "30s" — the chip and re-open label for a logged half. */
export function formatSide(s: SetEntry | undefined, ex: ExerciseDef): string {
  if (!s) return '-'
  const parts: string[] = []
  if (ex.requiresKg && s.kg !== undefined) parts.push(`${s.kg}kg`)
  if (s.reps !== undefined) parts.push(`×${s.reps}`)
  else if (s.seconds !== undefined) parts.push(`${s.seconds}s`)
  return parts.join(' ') || '-'
}

/** Chip text for a completed set: "60kg ×10", or "30s / 28s" per side. */
export function formatLoggedSet(s: SetEntry | undefined, ex: ExerciseDef): string {
  if (!s) return '-'
  if (!ex.perSide) return formatSide(s, ex)
  return `${formatSide(s, ex)} / ${sideLogged(s.right) ? formatSide(s.right, ex) : '—'}`
}

/** mm:ss, for every clock in v2. */
export function clock(secs: number): string {
  const s = Math.max(0, secs)
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}
