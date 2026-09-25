import { describe, it, expect } from 'vitest'
import {
  suggestNextWeight, repTargetFor, exerciseRepBand,
  explainNextWeight, explainRepTarget, describeWeight, describeRepTarget,
  INCREMENTS, BAND_REGRESS_GAP_DAYS, BAND_REBUILD_SESSIONS,
} from '../progression'
import type { Session } from '../../types'
import { getExercise, WORKOUTS, describeExerciseChoice } from '../../catalog/exercises'

describe('explainNextWeight', () => {
  it('names the rule behind every branch', () => {
    expect(explainNextWeight('timed', undefined, false).reason).toBe('unweighted')
    expect(explainNextWeight('dumbbell', undefined, false).reason).toBe('no-history')
    expect(explainNextWeight('dumbbell', 20, false).reason).toBe('hold')
    expect(explainNextWeight('dumbbell', 20, true).reason).toBe('increment')
    expect(explainNextWeight('dumbbell', 20, true, 21).reason).toBe('deload')
  })

  it('always agrees with suggestNextWeight', () => {
    const cases: Array<[Parameters<typeof suggestNextWeight>[0], number | undefined, boolean, number | undefined]> = [
      ['dumbbell', undefined, false, undefined],
      ['dumbbell', 20, false, 3],
      ['dumbbell', 20, true, 3],
      ['legPress', 100, true, 30],
      ['cable', 40, false, 14],
      ['timed', 10, true, 1],
    ]
    for (const [type, last, easy, days] of cases) {
      expect(explainNextWeight(type, last, easy, days).weight).toBe(suggestNextWeight(type, last, easy, days))
    }
  })

  it('describeWeight produces a sentence for every branch', () => {
    for (const e of [
      explainNextWeight('timed', undefined, false),
      explainNextWeight('dumbbell', undefined, false),
      explainNextWeight('dumbbell', 20, false),
      explainNextWeight('dumbbell', 20, true),
      explainNextWeight('dumbbell', 20, true, 21),
    ]) {
      expect(describeWeight(e).length).toBeGreaterThan(20)
    }
  })
})

// Build a sessions blob with one real set of `exId` on each given date.
function sessionsOn(exId: string, dates: string[]): Record<string, Session> {
  const sessions: Record<string, Session> = {}
  for (const date of dates) {
    sessions[date] = {
      workout: 'A', done: true,
      entries: { [exId]: { feltEasy: false, sets: [{ kg: 10, reps: 10 }] } },
    } as unknown as Session
  }
  return sessions
}

// N sessions on consecutive days ending the day before `asOf`.
function nSessionsBefore(exId: string, n: number, asOf = '2026-09-25'): Record<string, Session> {
  const end = new Date(`${asOf}T00:00:00Z`)
  const dates = Array.from({ length: n }, (_, i) => {
    const d = new Date(end); d.setUTCDate(d.getUTCDate() - (n - i)); return d.toISOString().slice(0, 10)
  })
  return sessionsOn(exId, dates)
}

describe('exerciseRepBand — session-count bands', () => {
  const id = 'dumbbell-bench-press'
  const asOf = '2026-09-25'

  it('band 1 for the first 8 sessions, 2 from the 9th, 3 from the 17th', () => {
    expect(exerciseRepBand({}, id, asOf)).toEqual({ band: 1, count: 0, countBand: 1 })
    expect(exerciseRepBand(nSessionsBefore(id, 7, asOf), id, asOf).band).toBe(1)
    expect(exerciseRepBand(nSessionsBefore(id, 8, asOf), id, asOf).band).toBe(2)
    expect(exerciseRepBand(nSessionsBefore(id, 16, asOf), id, asOf).band).toBe(3)
  })

  it('only sessions strictly before asOf count, and only with real sets', () => {
    const sessions = sessionsOn(id, ['2026-09-20', asOf])
    expect(exerciseRepBand(sessions, id, asOf).count).toBe(1)
    // A kg-only prefill is not training.
    const prefillOnly = { '2026-09-20': { workout: 'A', done: false, entries: { [id]: { feltEasy: false, sets: [{ kg: 10 }] } } } } as unknown as Record<string, Session>
    expect(exerciseRepBand(prefillOnly, id, asOf).count).toBe(0)
  })

  it('other exercises’ sessions do not advance this one', () => {
    expect(exerciseRepBand(nSessionsBefore('rdl', 12, asOf), id, asOf).count).toBe(0)
  })

  it(`a ${BAND_REGRESS_GAP_DAYS}+ day break drops one band until ${BAND_REBUILD_SESSIONS} sessions rebuild it`, () => {
    // 10 sessions long ago (band 2 earned), then a 40-day gap to today.
    const old = sessionsOn(id, Array.from({ length: 10 }, (_, i) => `2026-06-${String(i + 1).padStart(2, '0')}`))
    const afterBreak = exerciseRepBand(old, id, '2026-07-20')
    expect(afterBreak).toMatchObject({ band: 1, countBand: 2 })
    expect(afterBreak.regressed).toMatchObject({ sessionsSince: 0, sessionsToRestore: BAND_REBUILD_SESSIONS })

    // Two comeback sessions: still one short of restoring.
    const twoBack = { ...old, ...sessionsOn(id, ['2026-07-20', '2026-07-22']) }
    expect(exerciseRepBand(twoBack, id, '2026-07-24')).toMatchObject({
      band: 1, countBand: 2, regressed: { sessionsSince: 2, sessionsToRestore: 1 },
    })

    // Third comeback session: earned band restored (fast, not 8 sessions).
    const threeBack = { ...twoBack, ...sessionsOn(id, ['2026-07-24']) }
    const restored = exerciseRepBand(threeBack, id, '2026-07-26')
    expect(restored.band).toBe(2)
    expect(restored.regressed).toBeUndefined()
  })

  it('band 1 never regresses below 1', () => {
    const few = sessionsOn(id, ['2026-06-01', '2026-06-03'])
    expect(exerciseRepBand(few, id, '2026-09-25')).toEqual({ band: 1, count: 2, countBand: 1 })
  })
})

describe('explainRepTarget', () => {
  const bench = getExercise('dumbbell-bench-press')!
  const asOf = '2026-09-25'
  const bandInfo = (n: number) => exerciseRepBand(nSessionsBefore(bench.id, n, asOf), bench.id, asOf)

  it('reports the band and the band target', () => {
    const e = explainRepTarget(bench, bandInfo(8))
    expect(e.band).toBe(2)
    expect(e.target).toEqual(repTargetFor(bench, 2))
    expect(e.banded).toBe(true)
  })

  it('describes the target in words, from the session count', () => {
    const text = describeRepTarget(explainRepTarget(bench, bandInfo(8)))
    expect(text).toContain('3 x 8 reps')
    expect(text).toContain('logged this exercise 8 times')
  })

  it('flags the first session of a newly earned band with the ~10% weight nudge', () => {
    const e = explainRepTarget(bench, bandInfo(8)) // today is session 9
    expect(e.justAdvanced).toBe(true)
    expect(describeRepTarget(e)).toContain('about 10% weight')
    expect(explainRepTarget(bench, bandInfo(9)).justAdvanced).toBe(false)
  })

  it('explains a break regression and how fast the band comes back', () => {
    const old = sessionsOn(bench.id, Array.from({ length: 10 }, (_, i) => `2026-06-${String(i + 1).padStart(2, '0')}`))
    const e = explainRepTarget(bench, exerciseRepBand(old, bench.id, '2026-07-20'))
    expect(e.regressed).toBeTruthy()
    const text = describeRepTarget(e)
    expect(text).toContain('one band lower')
    expect(text).toContain(`${BAND_REBUILD_SESSIONS} more sessions`)
  })

  it('appends the authored repScheme note when the exercise has one', () => {
    const facePull = getExercise('face-pull')!
    const text = describeRepTarget(explainRepTarget(facePull, exerciseRepBand({}, facePull.id, asOf)))
    expect(text).toContain('3 x 15 reps')
    expect(text.endsWith(facePull.rationale!.repScheme!)).toBe(true)
    // Fixed-target exercises get the note too (curl deviates on purpose).
    const curl = getExercise('dumbbell-curl')!
    expect(describeRepTarget(explainRepTarget(curl, exerciseRepBand({}, curl.id, asOf))))
      .toContain(curl.rationale!.repScheme!)
  })
})

describe('INCREMENTS export', () => {
  it('matches the documented steps per equipment', () => {
    expect(INCREMENTS).toEqual({
      dumbbell: 1, legPress: 5, rdl: 2.5, cable: 2.5, bodyweight: null, timed: null,
    })
  })
})

describe('describeExerciseChoice', () => {
  it('names the workout and the minWeek ramp', () => {
    expect(describeExerciseChoice(getExercise('leg-press')!, 9)).toContain('Workout B')
    expect(describeExerciseChoice(getExercise('face-pull')!, 9)).toContain('week 9')
    expect(describeExerciseChoice(getExercise('face-pull')!, 3, new Set(['face-pull'])))
      .toContain('already trained it')
  })
})

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

  it('deloads ~10% (rounded to the increment) after a 14+ day gap', () => {
    expect(suggestNextWeight('dumbbell', 20, true, 14)).toBe(18)
    expect(suggestNextWeight('legPress', 100, false, 21)).toBe(90)
    expect(suggestNextWeight('cable', 30, true, 30)).toBe(27.5)
  })

  it('gap deload ignores feltEasy and never exceeds the old weight', () => {
    expect(suggestNextWeight('dumbbell', 3, true, 60)).toBe(3) // rounds to 3, capped at last
    expect(suggestNextWeight('dumbbell', 1, false, 60)).toBe(1) // floor at one increment
  })

  it('gaps under 14 days progress normally', () => {
    expect(suggestNextWeight('dumbbell', 20, true, 13)).toBe(21)
    expect(suggestNextWeight('dumbbell', 20, false, 13)).toBe(20)
  })

  it('suggests +2.5 for cable after easy session', () => {
    expect(suggestNextWeight('cable', 30, true)).toBe(32.5)
  })

  it('never returns less than lastWeight', () => {
    // Even without feltEasy, always returns >= lastWeight
    expect(suggestNextWeight('dumbbell', 20, false)).toBeGreaterThanOrEqual(20)
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
    const t = repTargetFor(bench, 2)
    expect(t).toEqual({ sets: 3, reps: 8 })
  })

  it('compound: 4x6 in band 3', () => {
    const t = repTargetFor(bench, 3)
    expect(t).toEqual({ sets: 4, reps: 6 })
  })

  it('RDL: 3x10 in band 1', () => {
    expect(repTargetFor(rdl, 1)).toEqual({ sets: 3, reps: 10 })
  })

  it('RDL: 3x10 in band 2 (lags compounds)', () => {
    expect(repTargetFor(rdl, 2)).toEqual({ sets: 3, reps: 10 })
  })

  it('RDL: 3x8 in band 3', () => {
    expect(repTargetFor(rdl, 3)).toEqual({ sets: 3, reps: 8 })
  })

  it('accessory (curl): 2x12 in all bands', () => {
    expect(repTargetFor(curl, 1)).toEqual({ sets: 2, reps: 12 })
    expect(repTargetFor(curl, 2)).toEqual({ sets: 2, reps: 12 })
    expect(repTargetFor(curl, 3)).toEqual({ sets: 2, reps: 12 })
  })

  it('Plank: seconds progression 30/45/60', () => {
    expect(repTargetFor(plank, 1)).toEqual({ sets: 3, seconds: 30 })
    expect(repTargetFor(plank, 2)).toEqual({ sets: 3, seconds: 45 })
    expect(repTargetFor(plank, 3)).toEqual({ sets: 3, seconds: 60 })
  })

  it('Face Pull: 3x15 in bands 1 and 2, 3x12 in band 3', () => {
    // Band 1 is reachable now that a logged Face Pull survives a week drop:
    // same load, 15 reps instead of 12 — a volume increase, which is fine.
    expect(repTargetFor(facePull, 1)).toEqual({ sets: 3, reps: 15 })
    expect(repTargetFor(facePull, 2)).toEqual({ sets: 3, reps: 15 })
    expect(repTargetFor(facePull, 3)).toEqual({ sets: 3, reps: 12 })
  })

  it('Pallof: 3x10/side all bands, addLoad in band 3', () => {
    expect(repTargetFor(pallof, 1)).toEqual({ sets: 3, reps: 10 })
    expect(repTargetFor(pallof, 2)).toEqual({ sets: 3, reps: 10 })
    expect(repTargetFor(pallof, 3)).toEqual({ sets: 3, reps: 10, addLoad: true })
  })
})

describe('Workout B catalog', () => {
  const workoutB = WORKOUTS.find(w => w.id === 'B')!

  it('does not contain retired exercises', () => {
    const ids = workoutB.exercises.map(e => e.id)
    // v2-2 swapped the tricep pushdown and bird dog out; the machine back
    // extension retired then too, but a WEIGHTED back extension returned in
    // plan v6 as B's direct lower-back hinge.
    expect(ids).not.toContain('tricep-pushdown')
    expect(ids).not.toContain('bird-dog')
  })

  it('contains the expected exercise list in order', () => {
    const ids = workoutB.exercises.map(e => e.id)
    // Standing calf raise moved to A (plan v4); back extension joined after
    // the lat pulldown (plan v6) as the lower-back hinge B lacked.
    expect(ids).toEqual(['leg-press', 'single-arm-row', 'lat-pulldown', 'back-extension', 'dumbbell-curl', 'overhead-tricep-extension', 'pallof-press', 'face-pull'])
  })

  it('getExercise returns undefined for retired ids', () => {
    expect(getExercise('tricep-pushdown')).toBeUndefined()
    expect(getExercise('bird-dog')).toBeUndefined()
  })

  it('back extension: weighted single-implement hinge, fixed 3x12', () => {
    const be = getExercise('back-extension')!
    expect(be.requiresKg).toBe(true)
    expect(be.load).toBe('single')
    expect(be.safetyCues).toContain('back')
    expect(be.repProgression).toEqual({
      band1: { sets: 3, reps: 12 }, band2: { sets: 3, reps: 12 }, band3: { sets: 3, reps: 12 },
    })
  })
})
