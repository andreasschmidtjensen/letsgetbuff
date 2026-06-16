import { describe, it, expect } from 'vitest'
import { suggestNextWeight, repBandFor, repTargetFor } from '../progression'
import { getExercise, WORKOUTS } from '../../catalog/exercises'

describe('suggestNextWeight', () => {
  it('returns null when no history', () => {
    expect(suggestNextWeight('dumbbell', undefined, false)).toBeNull()
  })

  it('returns null for bodyweight exercises', () => {
    expect(suggestNextWeight('bodyweight', undefined, false)).toBeNull()
    expect(suggestNextWeight('timed', undefined, false)).toBeNull()
  })

  it('holds weight when not felt easy', () => {
    expect(suggestNextWeight('dumbbell', 20, false)).toBe(20)
    expect(suggestNextWeight('legPress', 100, false)).toBe(100)
  })

  it('suggests +1 for dumbbell after easy session', () => {
    expect(suggestNextWeight('dumbbell', 20, true)).toBe(21)
  })

  it('suggests +5 for leg press after easy session', () => {
    expect(suggestNextWeight('legPress', 100, true)).toBe(105)
  })

  it('suggests +2.5 for RDL (conservative) after easy session', () => {
    expect(suggestNextWeight('rdl', 60, true)).toBe(62.5)
  })

  it('suggests +2.5 for cable after easy session', () => {
    expect(suggestNextWeight('cable', 30, true)).toBe(32.5)
  })

  it('never returns less than lastWeight', () => {
    // Even without feltEasy, always returns >= lastWeight
    expect(suggestNextWeight('dumbbell', 20, false)).toBeGreaterThanOrEqual(20)
  })
})

describe('repBandFor', () => {
  it('returns band 1 for weeks 1-8', () => {
    expect(repBandFor(1)).toBe(1)
    expect(repBandFor(8)).toBe(1)
  })

  it('returns band 2 starting at week 9', () => {
    expect(repBandFor(9)).toBe(2)
    expect(repBandFor(16)).toBe(2)
  })

  it('returns band 3 starting at week 17', () => {
    expect(repBandFor(17)).toBe(3)
    expect(repBandFor(26)).toBe(3)
  })
})

describe('repTargetFor', () => {
  const bench = getExercise('dumbbell-bench-press')!
  const rdl = getExercise('rdl')!
  const curl = getExercise('dumbbell-curl')!
  const plank = getExercise('plank')!
  const facePull = getExercise('face-pull')!
  const pallof = getExercise('pallof-press')!

  it('compound: 3x10 in band 1', () => {
    const t = repTargetFor(bench, 1)
    expect(t).toEqual({ sets: 3, reps: 10 })
  })

  it('compound: 3x8 in band 2', () => {
    const t = repTargetFor(bench, 9)
    expect(t).toEqual({ sets: 3, reps: 8 })
  })

  it('compound: 4x6 in band 3', () => {
    const t = repTargetFor(bench, 17)
    expect(t).toEqual({ sets: 4, reps: 6 })
  })

  it('RDL: 3x10 in band 1', () => {
    expect(repTargetFor(rdl, 1)).toEqual({ sets: 3, reps: 10 })
  })

  it('RDL: 3x10 in band 2 (lags compounds)', () => {
    expect(repTargetFor(rdl, 9)).toEqual({ sets: 3, reps: 10 })
  })

  it('RDL: 3x8 in band 3', () => {
    expect(repTargetFor(rdl, 17)).toEqual({ sets: 3, reps: 8 })
  })

  it('accessory (curl): 2x12 in all bands', () => {
    expect(repTargetFor(curl, 1)).toEqual({ sets: 2, reps: 12 })
    expect(repTargetFor(curl, 9)).toEqual({ sets: 2, reps: 12 })
    expect(repTargetFor(curl, 17)).toEqual({ sets: 2, reps: 12 })
  })

  it('Plank: seconds progression 30/45/60', () => {
    expect(repTargetFor(plank, 1)).toEqual({ sets: 3, seconds: 30 })
    expect(repTargetFor(plank, 9)).toEqual({ sets: 3, seconds: 45 })
    expect(repTargetFor(plank, 17)).toEqual({ sets: 3, seconds: 60 })
  })

  it('Face Pull: 3x15 in band 2, 3x12 in band 3', () => {
    expect(repTargetFor(facePull, 9)).toEqual({ sets: 3, reps: 15 })
    expect(repTargetFor(facePull, 17)).toEqual({ sets: 3, reps: 12 })
  })

  it('Pallof: 3x10/side all bands, addLoad in band 3', () => {
    expect(repTargetFor(pallof, 1)).toEqual({ sets: 3, reps: 10 })
    expect(repTargetFor(pallof, 9)).toEqual({ sets: 3, reps: 10 })
    expect(repTargetFor(pallof, 17)).toEqual({ sets: 3, reps: 10, addLoad: true })
  })
})

describe('Workout B catalog (v2-2)', () => {
  const workoutB = WORKOUTS.find(w => w.id === 'B')!

  it('does not contain retired exercises', () => {
    const ids = workoutB.exercises.map(e => e.id)
    expect(ids).not.toContain('back-extension')
    expect(ids).not.toContain('tricep-pushdown')
    expect(ids).not.toContain('bird-dog')
  })

  it('contains the v2-2 exercise list in order', () => {
    const ids = workoutB.exercises.map(e => e.id)
    expect(ids).toEqual(['leg-press', 'single-arm-row', 'lat-pulldown', 'dumbbell-curl', 'overhead-tricep-extension', 'pallof-press', 'face-pull'])
  })

  it('getExercise returns undefined for retired ids', () => {
    expect(getExercise('back-extension')).toBeUndefined()
    expect(getExercise('tricep-pushdown')).toBeUndefined()
    expect(getExercise('bird-dog')).toBeUndefined()
  })
})
