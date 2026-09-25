import { describe, it, expect } from 'vitest'
import {
  suggestHomeLevel, explainHomeLevel, describeHomeLevel,
  HOME_EASY_STREAK, HOME_REBUILD_SESSIONS,
} from '../homeProgression'
import { BAND_REGRESS_GAP_DAYS } from '../progression'
import type { ActivityEntry, StretchLevelId } from '../../types'

function withCircuits(circuits: { date: string; level?: StretchLevelId; feltEasy?: boolean }[]) {
  const activities: Record<string, ActivityEntry[]> = {}
  for (const c of circuits) {
    activities[c.date] = [{
      type: 'home', minutes: 13,
      ...(c.level !== undefined ? { levels: { 'bw-squat': c.level } } : {}),
      ...(c.feltEasy !== undefined ? { feltEasy: c.feltEasy } : {}),
    }]
  }
  return { activities }
}

const ID = 'bw-squat'
const ASOF = '2026-06-10'

describe('suggestHomeLevel', () => {
  it('starts at level 1 with no circuits', () => {
    expect(suggestHomeLevel({ activities: {} }, ID, ASOF)).toBe(1)
  })

  it(`levels up after ${HOME_EASY_STREAK} consecutive felt-easy circuits`, () => {
    expect(suggestHomeLevel(withCircuits([
      { date: '2026-06-01', level: 1, feltEasy: true },
      { date: '2026-06-04', level: 1, feltEasy: true },
    ]), ID, ASOF)).toBe(2)
  })

  it('a not-easy circuit resets the streak', () => {
    expect(suggestHomeLevel(withCircuits([
      { date: '2026-06-01', level: 1, feltEasy: true },
      { date: '2026-06-04', level: 1, feltEasy: false },
      { date: '2026-06-06', level: 1, feltEasy: true },
    ]), ID, ASOF)).toBe(1)
  })

  it('pre-v52 circuits (no levels/feltEasy) count but never advance', () => {
    expect(suggestHomeLevel(withCircuits([
      { date: '2026-06-01' }, { date: '2026-06-03' }, { date: '2026-06-05' },
    ]), ID, ASOF)).toBe(1)
    expect(explainHomeLevel(withCircuits([{ date: '2026-06-01' }]), ID, ASOF).count).toBe(1)
  })

  it('a manual jump to a harder variant counts as earning it', () => {
    expect(suggestHomeLevel(withCircuits([
      { date: '2026-06-01', level: 3, feltEasy: false },
    ]), ID, ASOF)).toBe(3)
  })

  it('caps at level 3', () => {
    expect(suggestHomeLevel(withCircuits([
      { date: '2026-05-28', level: 3, feltEasy: true },
      { date: '2026-06-01', level: 3, feltEasy: true },
      { date: '2026-06-04', level: 3, feltEasy: true },
    ]), ID, ASOF)).toBe(3)
  })
})

describe(`home layoff regression (${BAND_REGRESS_GAP_DAYS}+ days)`, () => {
  const earnedTwo = [
    { date: '2026-06-01', level: 1 as StretchLevelId, feltEasy: true },
    { date: '2026-06-04', level: 1 as StretchLevelId, feltEasy: true },
  ]

  it('a long break drops the suggestion one level, fast return restores it', () => {
    const e = explainHomeLevel(withCircuits(earnedTwo), ID, '2026-07-20') // 46 days later
    expect(e).toMatchObject({ level: 1, earnedLevel: 2 })
    expect(e.regressed).toMatchObject({ sessionsSince: 0, sessionsToRestore: HOME_REBUILD_SESSIONS })
    expect(describeHomeLevel(e)).toContain('one level lower')

    const back = withCircuits([
      ...earnedTwo,
      { date: '2026-07-20', level: 1, feltEasy: false },
      { date: '2026-07-22', level: 1, feltEasy: false },
    ])
    const restored = explainHomeLevel(back, ID, '2026-07-24')
    expect(restored.regressed).toBeUndefined()
    expect(restored.level).toBe(2)
  })

  it('level 1 never regresses below 1', () => {
    const e = explainHomeLevel(withCircuits([{ date: '2026-06-01', level: 1, feltEasy: false }]), ID, '2026-09-25')
    expect(e.level).toBe(1)
    expect(e.regressed).toBeUndefined()
  })
})
