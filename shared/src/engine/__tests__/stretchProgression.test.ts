import { describe, it, expect } from 'vitest'
import { suggestStretchLevel } from '../stretchProgression'
import { EMPTY_STATE } from '../../types'
import type { AppState, StretchLevelId } from '../../types'

function withLogs(entries: { date: string; level: StretchLevelId; feltEasy: boolean }[]): AppState {
  const st: AppState = { ...EMPTY_STATE, stretchSessions: {} }
  for (const e of entries) {
    st.stretchSessions[e.date] = { done: true, sessionId: 'daily', entries: { quad: { holds: [{ seconds: 30 }], level: e.level, feltEasy: e.feltEasy } } }
  }
  return st
}

describe('suggestStretchLevel', () => {
  it('starts at startLevel with no history', () => {
    expect(suggestStretchLevel(EMPTY_STATE, 'quad', 1)).toBe(1)
  })
  it('stays after a single easy session', () => {
    expect(suggestStretchLevel(withLogs([{ date: '2026-06-01', level: 1, feltEasy: true }]), 'quad', 1)).toBe(1)
  })
  it('levels up after two consecutive easy sessions', () => {
    expect(suggestStretchLevel(withLogs([
      { date: '2026-06-01', level: 1, feltEasy: true },
      { date: '2026-06-03', level: 1, feltEasy: true },
    ]), 'quad', 1)).toBe(2)
  })
  it('a not-easy session blocks the level-up', () => {
    expect(suggestStretchLevel(withLogs([
      { date: '2026-06-01', level: 1, feltEasy: true },
      { date: '2026-06-03', level: 1, feltEasy: false },
    ]), 'quad', 1)).toBe(1)
  })
  it('caps at level 3', () => {
    expect(suggestStretchLevel(withLogs([
      { date: '2026-06-01', level: 3, feltEasy: true },
      { date: '2026-06-03', level: 3, feltEasy: true },
    ]), 'quad', 1)).toBe(3)
  })
})
