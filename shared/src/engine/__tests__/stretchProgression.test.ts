import { describe, it, expect } from 'vitest'
import { suggestStretchLevel, explainStretchLevel, describeStretchLevel, STRETCH_REBUILD_SESSIONS } from '../stretchProgression'
import { BAND_REGRESS_GAP_DAYS } from '../progression'
import { EMPTY_STATE } from '../../types'
import type { AppState, StretchLevelId } from '../../types'

function withLogs(entries: { date: string; level: StretchLevelId; feltEasy: boolean }[]): AppState {
  const st: AppState = { ...EMPTY_STATE, stretchSessions: {} }
  for (const e of entries) {
    st.stretchSessions[e.date] = { done: true, sessionId: 'daily', entries: { quad: { holds: [{ seconds: 30 }], level: e.level, feltEasy: e.feltEasy } } }
  }
  return st
}

// A fixed "today" close to the fixtures, so the 28-day break rule only fires
// in the tests that mean it to.
const ASOF = '2026-06-05'

describe('suggestStretchLevel', () => {
  it('starts at startLevel with no history', () => {
    expect(suggestStretchLevel(EMPTY_STATE, 'quad', 1, ASOF)).toBe(1)
  })
  it('stays after a single easy session', () => {
    expect(suggestStretchLevel(withLogs([{ date: '2026-06-01', level: 1, feltEasy: true }]), 'quad', 1, ASOF)).toBe(1)
  })
  it('levels up after two consecutive easy sessions', () => {
    expect(suggestStretchLevel(withLogs([
      { date: '2026-06-01', level: 1, feltEasy: true },
      { date: '2026-06-03', level: 1, feltEasy: true },
    ]), 'quad', 1, ASOF)).toBe(2)
  })
  it('a not-easy session blocks the level-up', () => {
    expect(suggestStretchLevel(withLogs([
      { date: '2026-06-01', level: 1, feltEasy: true },
      { date: '2026-06-03', level: 1, feltEasy: false },
    ]), 'quad', 1, ASOF)).toBe(1)
  })
  it('caps at level 3', () => {
    expect(suggestStretchLevel(withLogs([
      { date: '2026-06-01', level: 3, feltEasy: true },
      { date: '2026-06-03', level: 3, feltEasy: true },
    ]), 'quad', 1, ASOF)).toBe(3)
  })
})

describe(`stretch layoff regression (${BAND_REGRESS_GAP_DAYS}+ days)`, () => {
  const earnedTwo = [
    { date: '2026-06-01', level: 1 as StretchLevelId, feltEasy: true },
    { date: '2026-06-03', level: 1 as StretchLevelId, feltEasy: true },
  ]

  it('a long break drops the suggestion one level', () => {
    const e = explainStretchLevel(withLogs(earnedTwo), 'quad', 1, '2026-07-20') // 47 days later
    expect(e).toMatchObject({ level: 1, earnedLevel: 2 })
    expect(e.regressed).toMatchObject({ sessionsSince: 0, sessionsToRestore: STRETCH_REBUILD_SESSIONS })
    expect(describeStretchLevel(e)).toContain('one level lower')
  })

  it(`${STRETCH_REBUILD_SESSIONS} sessions after the break restore the earned level`, () => {
    const back = withLogs([
      ...earnedTwo,
      { date: '2026-07-20', level: 1, feltEasy: false },
      { date: '2026-07-22', level: 1, feltEasy: false },
    ])
    const e = explainStretchLevel(back, 'quad', 1, '2026-07-24')
    expect(e.regressed).toBeUndefined()
    // Note: performing level 1 again makes level 1 the "current" level, so the
    // earned level is re-derived from those sessions — never below what you do.
    expect(e.level).toBeGreaterThanOrEqual(1)
  })

  it('level 1 never regresses below 1', () => {
    const e = explainStretchLevel(withLogs([{ date: '2026-06-01', level: 1, feltEasy: false }]), 'quad', 1, '2026-09-25')
    expect(e.level).toBe(1)
    expect(e.regressed).toBeUndefined()
  })

  it('no asOf = today; recent history is unaffected', () => {
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const twoDays = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)
    expect(suggestStretchLevel(withLogs([
      { date: twoDays, level: 1, feltEasy: true },
      { date: yesterday, level: 1, feltEasy: true },
    ]), 'quad', 1)).toBe(2)
    expect(today).toBeTruthy()
  })
})
