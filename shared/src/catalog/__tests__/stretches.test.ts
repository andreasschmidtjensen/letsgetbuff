import { describe, it, expect } from 'vitest'
import { DEFAULT_STRETCH_PLAN, getSessionStretches } from '../stretches'

describe('stretch catalog integrity', () => {
  const all = DEFAULT_STRETCH_PLAN.routines.flatMap(r => r.stretches)

  it('has both routines and stretches', () => {
    expect(all.length).toBeGreaterThanOrEqual(16)
  })

  it('plan version is 4 (neck stretch + 45s L3 dose)', () => {
    expect(DEFAULT_STRETCH_PLAN.version).toBe(4)
  })

  it('every stretch has 3 ascending levels', () => {
    for (const s of all) expect(s.levels.map(l => l.level)).toEqual([1, 2, 3])
  })

  it('levels are valid for their kind', () => {
    for (const s of all) for (const l of s.levels) {
      expect(l.videoId).toMatch(/^[A-Za-z0-9_-]{11}$/)
      if (s.kind === 'hold') {
        expect(l.holdSeconds ?? 0).toBeGreaterThanOrEqual(10)
        expect(l.holdSeconds ?? 0).toBeLessThanOrEqual(60)
      } else {
        expect((l.durationSeconds ?? 0) + (l.reps ?? 0)).toBeGreaterThan(0)
      }
    }
  })

  it('hold stretches step up to a 45s dose at level 3 (neck stays gentle at 30s)', () => {
    for (const s of all.filter(x => x.kind === 'hold')) {
      expect(s.levels[2].holdSeconds).toBe(s.id === 'neck' ? 30 : 45)
    }
  })

  it('neck stretch covers the desk-work gap', () => {
    const neck = all.find(s => s.id === 'neck')!
    expect(neck.area).toContain('neck')
    expect(neck.perSide).toBe(true)
  })

  it('per-side content has a per-side timer (chest L3 overrides its bilateral def)', () => {
    const chest = all.find(s => s.id === 'chest')!
    expect(chest.perSide).toBe(false) // L1/L2 doorway stretches hit both sides at once
    expect(chest.levels[2].perSide).toBe(true) // L3 single-arm variant runs per side
  })

  it('stretch ids are unique', () => {
    const ids = all.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("'daily' session is flow then static", () => {
    const seq = getSessionStretches('daily')
    const kinds = seq.map(s => s.kind)
    const firstHold = kinds.indexOf('hold')
    expect(firstHold).toBeGreaterThan(0)
    expect(kinds.slice(0, firstHold).every(k => k === 'flow')).toBe(true)
    expect(kinds.slice(firstHold).every(k => k === 'hold')).toBe(true)
  })

  it('session routineIds resolve to real routines', () => {
    for (const sp of DEFAULT_STRETCH_PLAN.sessions)
      for (const rid of sp.routineIds)
        expect(DEFAULT_STRETCH_PLAN.routines.find(r => r.id === rid)).toBeTruthy()
  })
})
