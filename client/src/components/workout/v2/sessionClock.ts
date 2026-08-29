/**
 * The v2 session clock.
 *
 * `sessionStartedAt` in WorkoutView is component state, so a reload or a tab
 * switch mid-workout used to restart the elapsed time from zero. The start
 * stamp lives here in localStorage instead, keyed by the day and workout being
 * trained, and is read back on mount.
 *
 * Device-local: it only has to survive a reload on the phone in your hand. The
 * finished duration goes into AppState (`Session.durationSec`), which is what
 * syncs and backs up.
 */

const KEY = 'letsgetbuff-session-clock'

/** A start older than this is a forgotten session, not a very long workout. */
const STALE_AFTER_MS = 8 * 60 * 60 * 1000

interface Stored {
  key: string
  startedAt: number
}

function slot(dateStr: string, workout: string): string {
  return `${dateStr}-${workout}`
}

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Stored
    if (typeof parsed?.startedAt !== 'number' || typeof parsed?.key !== 'string') return null
    if (Date.now() - parsed.startedAt > STALE_AFTER_MS) return null
    return parsed
  } catch {
    return null
  }
}

/** The stamp for this day+workout, or null if none is running. */
export function getSessionStart(dateStr: string, workout: string): number | null {
  const stored = read()
  return stored && stored.key === slot(dateStr, workout) ? stored.startedAt : null
}

/** Start the clock, unless one is already running for this day+workout. */
export function startSessionClock(dateStr: string, workout: string): number {
  const existing = getSessionStart(dateStr, workout)
  if (existing !== null) return existing
  const startedAt = Date.now()
  try {
    localStorage.setItem(KEY, JSON.stringify({ key: slot(dateStr, workout), startedAt }))
  } catch {
    // Storage blocked: the clock still runs, it just won't survive a reload.
  }
  return startedAt
}

/** Stop the clock and return the elapsed whole seconds, or null if none ran. */
export function endSessionClock(dateStr: string, workout: string): number | null {
  const startedAt = getSessionStart(dateStr, workout)
  try {
    localStorage.removeItem(KEY)
  } catch {
    // As above.
  }
  if (startedAt === null) return null
  return Math.max(1, Math.round((Date.now() - startedAt) / 1000))
}

/** "47 min" / "1h 05m" / "58s" — the finished-session label. */
export function formatElapsed(secs: number): string {
  if (secs < 60) return `${secs}s`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${(mins % 60).toString().padStart(2, '0')}m`
}
