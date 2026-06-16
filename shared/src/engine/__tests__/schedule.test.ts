import { describe, it, expect } from 'vitest'
import { isoWeekKey, computeProgramWeek, phaseFor, scheduleFor } from '../schedule'
import { keyToDate } from '../../lib/date'

describe('isoWeekKey', () => {
  it('returns correct key for a known Monday', () => {
    // 2026-W23 starts on Mon 2026-06-01
    expect(isoWeekKey(keyToDate('2026-06-01'))).toBe('2026-W23')
  })

  it('returns same key for all days in a week', () => {
    const keys = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07']
      .map(d => isoWeekKey(keyToDate(d)))
    expect(new Set(keys).size).toBe(1)
  })
})

describe('computeProgramWeek', () => {
  it('returns 1 for start in current week with no skips', () => {
    const today = keyToDate('2026-06-05')
    const result = computeProgramWeek('2026-06-01', [], today)
    expect(result).toBe(1)
  })

  it('advances by 1 per elapsed non-skipped week', () => {
    const today = keyToDate('2026-06-15') // 2 weeks after start
    const result = computeProgramWeek('2026-06-01', [], today)
    expect(result).toBe(3)
  })

  it('skipped week does not advance program week', () => {
    const today = keyToDate('2026-06-15')
    const startDate = '2026-06-01'
    // Week W24 (2026-06-08) is skipped
    const withSkip = computeProgramWeek(startDate, ['2026-W24'], today)
    const withoutSkip = computeProgramWeek(startDate, [], today)
    expect(withSkip).toBe(withoutSkip - 1)
  })

  it('caps at 26', () => {
    // Start 27 weeks ago
    const today = keyToDate('2026-06-15')
    const result = computeProgramWeek('2025-12-01', [], today)
    expect(result).toBe(26)
  })
})

describe('phaseFor', () => {
  it('weeks 1-4 are Phase 1', () => {
    for (let w = 1; w <= 4; w++) {
      expect(phaseFor(w).phase).toBe(1)
      expect(phaseFor(w).label).toBe('Foundation')
    }
  })

  it('weeks 5-16 are Phase 2', () => {
    for (let w = 5; w <= 16; w++) {
      expect(phaseFor(w).phase).toBe(2)
      expect(phaseFor(w).label).toBe('Build')
    }
  })

  it('weeks 17-26 are Phase 3', () => {
    for (let w = 17; w <= 26; w++) {
      expect(phaseFor(w).phase).toBe(3)
      expect(phaseFor(w).label).toBe('Consolidate')
    }
  })
})

describe('scheduleFor', () => {
  it('Phase 1: Tue=gym-a, Sat=gym-b, rest=rest', () => {
    const s = scheduleFor(1)
    expect(s.tue).toBe('gym-a')
    expect(s.sat).toBe('gym-b')
    expect(s.mon).toBe('rest')
    expect(s.wed).toBe('rest')
  })

  it('Wk 5-8: adds Wed and Fri bike, Sat still gym-b', () => {
    const s = scheduleFor(5)
    expect(s.wed).toBe('bike')
    expect(s.fri).toBe('bike')
    expect(s.sat).toBe('gym-b')
  })

  it('Wk 13+: Sat becomes bike instead of gym-b', () => {
    const s13 = scheduleFor(13)
    expect(s13.sat).toBe('bike')
    const s12 = scheduleFor(12)
    expect(s12.sat).toBe('gym-b')
  })
})
