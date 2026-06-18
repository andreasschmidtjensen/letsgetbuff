import { describe, it, expect } from 'vitest'
import { stretchScheduleFor, isStretchDay, scheduleFor } from '../schedule'
import type { DayName } from '../schedule'

const ORDER: DayName[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

describe('stretch schedule', () => {
  it('never lands on a gym (A/B) day, weeks 1-26', () => {
    for (let w = 1; w <= 26; w++) {
      const days = stretchScheduleFor(w)
      const sched = scheduleFor(w)
      for (const d of days) expect(['gym-a', 'gym-b']).not.toContain(sched[d])
    }
  })
  it('no two stretch days are consecutive within the week', () => {
    for (let w = 1; w <= 26; w++) {
      const days = stretchScheduleFor(w)
      for (let i = 0; i < ORDER.length - 1; i++) {
        if (days.has(ORDER[i])) expect(days.has(ORDER[i + 1])).toBe(false)
      }
    }
  })
  it('isStretchDay false when disabled', () => {
    expect(isStretchDay(1, 'mon', false)).toBe(false)
  })
  it('isStretchDay honours the Mon/Wed/Fri pattern when enabled', () => {
    expect(isStretchDay(1, 'mon', true)).toBe(true)
    expect(isStretchDay(1, 'tue', true)).toBe(false)
    expect(isStretchDay(10, 'wed', true)).toBe(true)
  })
})
