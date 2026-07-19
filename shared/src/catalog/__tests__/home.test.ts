import { describe, it, expect } from 'vitest'
import { HOME_WORKOUT, homeWorkoutSteps, homeWorkoutMinutes } from '../home'

describe('home workout catalog integrity (issue #1)', () => {
  it('fits the 10-15 minute window', () => {
    const mins = homeWorkoutMinutes()
    expect(mins).toBeGreaterThanOrEqual(10)
    expect(mins).toBeLessThanOrEqual(15)
  })

  it('exercise ids are unique and every exercise has cues', () => {
    const ids = HOME_WORKOUT.exercises.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const ex of HOME_WORKOUT.exercises) expect(ex.cues.length).toBeGreaterThan(0)
  })

  it('steps: warm-up first, all exercises per round, no trailing rest', () => {
    const steps = homeWorkoutSteps()
    expect(steps[0].kind).toBe('warmup')
    expect(steps[steps.length - 1].kind).toBe('work')
    const work = steps.filter(s => s.kind === 'work')
    expect(work.length).toBe(HOME_WORKOUT.rounds * HOME_WORKOUT.exercises.length)
    // A rest between every pair of consecutive work steps.
    const rests = steps.filter(s => s.kind === 'rest')
    expect(rests.length).toBe(work.length - 1)
    for (const s of steps) expect(s.seconds).toBeGreaterThan(0)
  })
})
