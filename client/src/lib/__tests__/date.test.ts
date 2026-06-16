import { describe, it, expect } from 'vitest'
import { dateKey, todayKey, keyToDate, addDays } from '../date'

// These tests run under a pinned non-UTC timezone (America/New_York, UTC-4/-5),
// configured in vite.config.ts. That lets us prove dateKey uses the LOCAL civil
// date rather than the UTC date — the bug that filed late-night logs under the
// wrong day. Guard against a misconfigured run:
const RUNNING_NON_UTC = new Date(Date.UTC(2026, 5, 15, 3, 30)).getTimezoneOffset() !== 0

describe('dateKey', () => {
  it('sanity: test timezone is non-UTC', () => {
    expect(RUNNING_NON_UTC).toBe(true)
  })

  it('returns the LOCAL civil date, not the UTC date, just before local midnight', () => {
    // 03:30 UTC on the 15th is 23:30 in New York on the 14th.
    const d = new Date(Date.UTC(2026, 5, 15, 3, 30))
    expect(dateKey(d)).toBe('2026-06-14')                    // correct local day
    expect(d.toISOString().slice(0, 10)).toBe('2026-06-15')  // the old, buggy key
  })

  it('zero-pads month and day', () => {
    expect(dateKey(new Date(2026, 0, 5, 12))).toBe('2026-01-05')
  })
})

describe('todayKey', () => {
  it('agrees with dateKey(now)', () => {
    expect(todayKey()).toBe(dateKey(new Date()))
  })
})

describe('keyToDate', () => {
  it('round-trips with dateKey', () => {
    expect(dateKey(keyToDate('2026-06-05'))).toBe('2026-06-05')
  })

  it('anchors at local noon so the civil day is stable', () => {
    const d = keyToDate('2026-06-05')
    expect(d.getHours()).toBe(12)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(5)
    expect(d.getDate()).toBe(5)
  })
})

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(dateKey(addDays(keyToDate('2026-01-31'), 1))).toBe('2026-02-01')
  })

  it('is stable across a spring-forward DST transition', () => {
    // DST begins Sun 2026-03-08 at 02:00 in New York.
    expect(dateKey(addDays(keyToDate('2026-03-07'), 1))).toBe('2026-03-08')
    expect(dateKey(addDays(keyToDate('2026-03-08'), 1))).toBe('2026-03-09')
  })

  it('goes backwards with a negative delta', () => {
    expect(dateKey(addDays(keyToDate('2026-06-01'), -1))).toBe('2026-05-31')
  })
})
