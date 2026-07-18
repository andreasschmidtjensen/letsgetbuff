import { describe, it, expect } from 'vitest'
import { DEFAULT_PLAN, WORKOUTS } from '../exercises'

describe('exercise catalog integrity', () => {
  it('has workouts A and B', () => {
    expect(WORKOUTS.map(w => w.id)).toEqual(['A', 'B'])
  })

  it('exercise ids are unique across workouts', () => {
    const ids = WORKOUTS.flatMap(w => w.exercises.map(e => e.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('both warmups include the plank step', () => {
    for (const w of WORKOUTS) expect(w.warmup).toMatch(/plank/i)
  })

  it('plan version is 3 (reverse-plank warmups + side plank + calf raise)', () => {
    expect(DEFAULT_PLAN.version).toBe(3)
  })
})
