/**
 * Guest mode — sign-in-free demo access.
 *
 * Pressing "Continue as guest" on the login screen drops you into the full app
 * (workouts, stretch, at-home training, focus mode, timers, history/metrics
 * views) with a seeded demo state, but **nothing is ever written anywhere**:
 * no server calls that mutate, no localStorage, no proxy queue. Everything the
 * guest logs lives in React state and disappears on reload or exit.
 *
 * The flag is a module-level singleton rather than context because the write
 * paths that must be blocked (`persistence.ts`) are plain modules called from
 * many components — one choke point is safer than threading a prop everywhere.
 * It's set once, before the authenticated tree mounts, and cleared on exit
 * (which unmounts that tree), so no re-render subscription is needed.
 */

import { EMPTY_STATE, dateKey, isoWeekKey, weekKeyToMonday } from '@letsgetbuff/shared'
import type { AppState } from '@letsgetbuff/shared'

export const GUEST_USERNAME = 'Guest'

let guestMode = false

export function isGuestMode(): boolean {
  return guestMode
}

export function setGuestMode(on: boolean): void {
  guestMode = on
}

/**
 * Starting point for a guest session: the program begins on the Monday of the
 * current week, so week 1 of the plan is "this week" and both gym days (Tue = A,
 * Sat = B) are reachable straight away. Never persisted.
 */
export function guestSeedState(today: Date = new Date()): AppState {
  return {
    ...EMPTY_STATE,
    startDate: dateKey(weekKeyToMonday(isoWeekKey(today))),
    skippedWeeks: [],
    sessions: {},
    stretchSessions: {},
    activities: {},
    metrics: {},
    milestones: {},
  }
}
