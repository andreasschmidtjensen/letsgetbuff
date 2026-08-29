/**
 * Session duration. The elapsed time is measured from a persisted start stamp
 * (so a reload mid-workout resumes rather than restarting) and written once
 * into `Session.durationSec` when the day is marked done.
 */

import { test, expect, beforeEach, afterEach, vi } from 'vitest'
import { EMPTY_STATE, SCHEMA_VERSION } from '@letsgetbuff/shared'
import type { AppState } from '@letsgetbuff/shared'
import { reducer } from '../../../store/reducer'
import { validateImport } from '../../../store/persistence'
import { getSessionStart, startSessionClock, endSessionClock, formatElapsed } from '../v2/sessionClock'

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-29T10:00:00Z'))
})
afterEach(() => { vi.useRealTimers() })

test('the clock survives a reload and resumes the same start', () => {
  const started = startSessionClock('2026-08-29', 'B')
  vi.advanceTimersByTime(20 * 60_000)
  // A "reload" is just reading it back — nothing is held in memory.
  expect(getSessionStart('2026-08-29', 'B')).toBe(started)
})

test('starting twice keeps the original start', () => {
  const first = startSessionClock('2026-08-29', 'B')
  vi.advanceTimersByTime(5 * 60_000)
  expect(startSessionClock('2026-08-29', 'B')).toBe(first)
})

test('a clock belongs to one day and workout', () => {
  startSessionClock('2026-08-29', 'B')
  expect(getSessionStart('2026-08-29', 'A')).toBeNull()
  expect(getSessionStart('2026-08-28', 'B')).toBeNull()
})

test('a forgotten clock goes stale instead of reporting a 30-hour workout', () => {
  startSessionClock('2026-08-29', 'B')
  vi.advanceTimersByTime(30 * 60 * 60_000)
  expect(getSessionStart('2026-08-29', 'B')).toBeNull()
})

test('ending returns the elapsed seconds and clears the clock', () => {
  startSessionClock('2026-08-29', 'B')
  vi.advanceTimersByTime(47 * 60_000 + 12_000)
  expect(endSessionClock('2026-08-29', 'B')).toBe(47 * 60 + 12)
  expect(getSessionStart('2026-08-29', 'B')).toBeNull()
  expect(endSessionClock('2026-08-29', 'B')).toBeNull()
})

test('MARK_DAY_DONE stores the duration, and marking done again never wipes it', () => {
  const base: AppState = { ...EMPTY_STATE, schemaVersion: SCHEMA_VERSION, startDate: '2026-08-01' }
  const withDuration = reducer(base, { type: 'MARK_DAY_DONE', date: '2026-08-29', workout: 'B', durationSec: 2832 })
  expect(withDuration.sessions['2026-08-29'].durationSec).toBe(2832)

  // Marking done from somewhere that measured nothing must not erase it.
  const again = reducer(withDuration, { type: 'MARK_DAY_DONE', date: '2026-08-29', workout: 'B' })
  expect(again.sessions['2026-08-29'].durationSec).toBe(2832)
})

test('a session with a duration round-trips through export/import', () => {
  const base: AppState = { ...EMPTY_STATE, schemaVersion: SCHEMA_VERSION, startDate: '2026-08-01' }
  const state = reducer(base, { type: 'MARK_DAY_DONE', date: '2026-08-29', workout: 'B', durationSec: 2832 })
  const exported = JSON.stringify(state)
  const imported = validateImport(JSON.parse(exported))
  expect(JSON.stringify(imported)).toBe(exported)
  expect(imported!.sessions['2026-08-29'].durationSec).toBe(2832)
})

test('an old backup with no duration still imports and simply has none', () => {
  const imported = validateImport({
    schemaVersion: 1, startDate: '2025-01-06', skippedWeeks: [],
    sessions: { '2025-01-07': { workout: 'A', done: true, entries: {} } },
    metrics: {}, milestones: {},
  })
  expect(imported).not.toBeNull()
  expect(imported!.sessions['2025-01-07'].durationSec).toBeUndefined()
  expect(imported!.sessions['2025-01-07'].done).toBe(true)
})

test('elapsed reads as a length, not a clock', () => {
  expect(formatElapsed(58)).toBe('58s')
  expect(formatElapsed(2832)).toBe('47 min')
  expect(formatElapsed(3900)).toBe('1h 05m')
})
