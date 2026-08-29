import type { ExerciseDef } from '@letsgetbuff/shared'

// Per-exercise rest preference: do the two of you rest together, or take turns?
// Chosen once and remembered per device, so it isn't a decision every session.

export const REST_MODE_KEY = 'letsgetbuff-rest-mode'

export type RestMode = 'together' | 'turns'

export interface RestModeEntry {
  mode: RestMode
  secs?: number
}

type RestModeMap = Record<string, RestModeEntry>

function read(): RestModeMap {
  try {
    const raw = localStorage.getItem(REST_MODE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? (parsed as RestModeMap) : {}
  } catch {
    return {}
  }
}

/**
 * First-visit default, from the plan rather than a guess: timed holds and
 * back-cued core work are done side by side, so you rest together; anything
 * loaded means sharing a bar or a machine, so you take turns.
 */
export function defaultRestMode(ex: ExerciseDef): RestMode {
  if (ex.progressionType === 'timed') return 'together'
  if (ex.safetyCues.includes('back') && !ex.requiresKg) return 'together'
  if (ex.requiresKg) return 'turns'
  return 'together'
}

export function getRestMode(ex: ExerciseDef): RestMode {
  return read()[ex.id]?.mode ?? defaultRestMode(ex)
}

export function getRestSecs(exerciseId: string): number | undefined {
  return read()[exerciseId]?.secs
}

export function setRestMode(exerciseId: string, mode: RestMode): void {
  const map = read()
  map[exerciseId] = { ...map[exerciseId], mode }
  try {
    localStorage.setItem(REST_MODE_KEY, JSON.stringify(map))
  } catch {
    // A full or blocked localStorage costs the memory, not the workout.
  }
}

export function setRestSecs(exerciseId: string, secs: number): void {
  const map = read()
  const mode = map[exerciseId]?.mode ?? 'turns'
  map[exerciseId] = { mode, secs }
  try {
    localStorage.setItem(REST_MODE_KEY, JSON.stringify(map))
  } catch {
    // As above.
  }
}
