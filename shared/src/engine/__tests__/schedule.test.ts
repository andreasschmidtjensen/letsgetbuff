import { describe, it, expect } from 'vitest'
import { isoWeekKey, computeProgramWeek, isGymTraining, phaseFor, scheduleFor } from '../schedule'
import { dateKey, keyToDate } from '../../lib/date'
import type { Session } from '../../types'

const gym = (workout: 'A' | 'B' = 'A'): Session => ({ workout, done: true, entries: {} })

// A gym session on the Tuesday of each listed ISO week
const trainedOn = (...dates: string[]): Record<string, Session> =>
  Object.fromEntries(dates.map(d => [d, gym()]))

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

describe('isGymTraining', () => {
  it('counts a completed Workout A or B', () => {
    expect(isGymTraining(gym('A'))).toBe(true)
    expect(isGymTraining(gym('B'))).toBe(true)
  })

  it('counts an unmarked session that has real logged sets', () => {
    const s: Session = { workout: 'A', done: false, entries: { squat: { sets: [{ kg: 60, reps: 8 }], feltEasy: false } } }
    expect(isGymTraining(s)).toBe(true)
  })

  it('does not count an opened-but-empty session', () => {
    expect(isGymTraining({ workout: 'A', done: false, entries: {} })).toBe(false)
    expect(isGymTraining({ workout: 'A', done: false, entries: { squat: { sets: [], feltEasy: false } } })).toBe(false)
  })

  it('does not count bike, run or rest days', () => {
    for (const w of ['bike', 'run', 'rest'] as const) {
      expect(isGymTraining({ workout: w, done: true, entries: {} })).toBe(false)
    }
  })
})

describe('computeProgramWeek', () => {
  it('returns 1 for start in current week with nothing logged', () => {
    const today = keyToDate('2026-06-05')
    expect(computeProgramWeek('2026-06-01', [], {}, today)).toBe(1)
  })

  it('advances by 1 per elapsed week that contains a gym session', () => {
    const today = keyToDate('2026-06-15') // W25; W23 and W24 elapsed
    const sessions = trainedOn('2026-06-02', '2026-06-09')
    expect(computeProgramWeek('2026-06-01', [], sessions, today)).toBe(3)
  })

  it('does not advance for an elapsed week with no gym session', () => {
    const today = keyToDate('2026-06-15')
    const sessions = trainedOn('2026-06-02') // W24 untrained
    expect(computeProgramWeek('2026-06-01', [], sessions, today)).toBe(2)
  })

  it('does not advance for weeks of only home workouts, stretches, runs or rides', () => {
    const today = keyToDate('2026-06-15')
    // Runs/rides/rest land in sessions as non-gym workouts; home workouts and
    // stretches never reach sessions at all.
    const sessions: Record<string, Session> = {
      '2026-06-03': { workout: 'bike', done: true, entries: {} },
      '2026-06-10': { workout: 'run', done: true, entries: {} },
    }
    expect(computeProgramWeek('2026-06-01', [], sessions, today)).toBe(1)
  })

  it('never moves backwards when a week is missed', () => {
    const sessions = trainedOn('2026-06-02') // trained W23 only
    const inW24 = computeProgramWeek('2026-06-01', [], sessions, keyToDate('2026-06-08'))
    const inW25 = computeProgramWeek('2026-06-01', [], sessions, keyToDate('2026-06-15'))
    expect(inW24).toBe(2)
    expect(inW25).toBe(2) // W24 was missed, so week 2 is still in progress
  })

  it('skipped week does not advance program week', () => {
    const today = keyToDate('2026-06-15')
    const sessions = trainedOn('2026-06-02', '2026-06-09')
    // Week W24 (2026-06-08) is skipped even though it was trained
    const withSkip = computeProgramWeek('2026-06-01', ['2026-W24'], sessions, today)
    const withoutSkip = computeProgramWeek('2026-06-01', [], sessions, today)
    expect(withSkip).toBe(withoutSkip - 1)
  })

  it('caps at 26', () => {
    // A gym session every week for 30 weeks starting 2025-12-01
    const sessions: Record<string, Session> = {}
    const d = keyToDate('2025-12-01')
    for (let i = 0; i < 30; i++) {
      sessions[dateKey(d)] = gym()
      d.setDate(d.getDate() + 7)
    }
    expect(computeProgramWeek('2025-12-01', [], sessions, keyToDate('2026-06-15'))).toBe(26)
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
  it('prescribes only the core gym days: Tue=gym-a, Sat=gym-b, rest otherwise', () => {
    for (const w of [1, 5, 13, 26]) {
      const s = scheduleFor(w)
      expect(s.tue).toBe('gym-a')
      expect(s.sat).toBe('gym-b')
      expect([s.mon, s.wed, s.thu, s.fri, s.sun]).toEqual(['rest', 'rest', 'rest', 'rest', 'rest'])
    }
  })

  it('never drops Workout B (regression: wk13+ used to swap Sat to bike)', () => {
    for (let w = 1; w <= 26; w++) expect(scheduleFor(w).sat).toBe('gym-b')
  })
})
