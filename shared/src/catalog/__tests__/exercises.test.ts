import { describe, it, expect } from 'vitest'
import { DEFAULT_PLAN, WORKOUTS, getWorkoutExercises } from '../exercises'

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

describe('getWorkoutExercises — minWeek ramp', () => {
  const idsB = (week: number, logged?: Set<string>) =>
    getWorkoutExercises('B', week, logged).map(e => e.id)

  it('hides Face Pull for a new user below week 9', () => {
    expect(idsB(1)).not.toContain('face-pull')
    expect(idsB(8)).not.toContain('face-pull')
  })

  it('shows Face Pull from week 9 on', () => {
    expect(idsB(9)).toContain('face-pull')
    expect(idsB(17)).toContain('face-pull')
  })

  it('keeps Face Pull below week 9 once logged (once trained, always yours)', () => {
    expect(idsB(3, new Set(['face-pull']))).toContain('face-pull')
    expect(idsB(1, new Set(['face-pull']))).toContain('face-pull')
  })

  it('an unrelated logged id does not un-hide Face Pull', () => {
    expect(idsB(3, new Set(['leg-press']))).not.toContain('face-pull')
  })

  it('preserves catalog order and never duplicates', () => {
    const catalog = WORKOUTS.find(w => w.id === 'B')!.exercises.map(e => e.id)
    expect(idsB(9, new Set(['face-pull']))).toEqual(catalog)
  })

  it('workout A is unaffected — no exercise there has a minWeek', () => {
    const catalog = WORKOUTS.find(w => w.id === 'A')!.exercises.map(e => e.id)
    expect(getWorkoutExercises('A', 1).map(e => e.id)).toEqual(catalog)
  })
})
