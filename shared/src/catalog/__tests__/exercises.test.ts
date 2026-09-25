import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PLAN, WORKOUTS, getWorkoutExercises, describeExerciseChoice,
  loadSuffix, kgCaption, describeLoadMode,
} from '../exercises'

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

  it('plan version is 6 (back extension joins B)', () => {
    expect(DEFAULT_PLAN.version).toBe(6)
  })

  it('every weighted exercise declares a load mode; unweighted never do', () => {
    for (const e of WORKOUTS.flatMap(w => w.exercises)) {
      if (e.requiresKg) {
        expect(e.load, e.id).toMatch(/^(perHand|single|total)$/)
      } else {
        expect(e.load, e.id).toBeUndefined()
      }
    }
  })

  it('every exercise carries a rationale purpose', () => {
    for (const e of WORKOUTS.flatMap(w => w.exercises)) {
      expect(e.rationale?.purpose, e.id).toBeTruthy()
    }
  })

  it('B carries one more exercise than A at week 9+ (back extension, plan v6)', () => {
    expect(getWorkoutExercises('A', 9).length).toBe(7)
    expect(getWorkoutExercises('B', 9).length).toBe(8)
  })

  it('standing calf raise lives in workout A', () => {
    expect(getWorkoutExercises('A', 1).map(e => e.id)).toContain('standing-calf-raise')
    expect(getWorkoutExercises('B', 1).map(e => e.id)).not.toContain('standing-calf-raise')
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

describe('load-mode display helpers', () => {
  it('loadSuffix per mode', () => {
    expect(loadSuffix({ load: 'perHand' })).toBe('/hand')
    expect(loadSuffix({ load: 'single' })).toBe(' (1 DB)')
    expect(loadSuffix({ load: 'total' })).toBe('')
    expect(loadSuffix({})).toBe('') // unlabeled (old plan row) renders plain
  })

  it('kgCaption per mode', () => {
    expect(kgCaption({ load: 'perHand' })).toBe('KG/HAND')
    expect(kgCaption({ load: 'single' })).toBe('KG (1 DB)')
    expect(kgCaption({ load: 'total' })).toBe('KG')
    expect(kgCaption({})).toBe('KG')
  })

  it('describeLoadMode: a sentence per mode, null when unweighted or unlabeled', () => {
    expect(describeLoadMode({ requiresKg: true, load: 'perHand' })).toMatch(/per dumbbell/)
    expect(describeLoadMode({ requiresKg: true, load: 'single' })).toMatch(/one dumbbell/)
    expect(describeLoadMode({ requiresKg: true, load: 'total' })).toMatch(/total load/)
    expect(describeLoadMode({ requiresKg: true })).toBeNull()
    expect(describeLoadMode({ requiresKg: false, load: 'total' })).toBeNull()
  })
})

describe('describeExerciseChoice — rationale', () => {
  const bench = WORKOUTS.flatMap(w => w.exercises).find(e => e.id === 'dumbbell-bench-press')!

  it('prepends the authored purpose when present', () => {
    const text = describeExerciseChoice(bench, 3)
    expect(text.startsWith(bench.rationale!.purpose)).toBe(true)
    expect(text).toContain('is part of Workout A')
  })

  it('without a rationale the text is exactly the pre-rationale copy', () => {
    const stripped = { ...bench, rationale: undefined }
    expect(describeExerciseChoice(stripped, 3)).toBe(
      'Dumbbell Bench Press is part of Workout A (Push & Hinge), which the calendar prescribes for today.' +
      ' If the equipment is taken or it does not feel right, Push-up or Machine chest press covers the same job.',
    )
  })
})
