import { describe, it, expect } from 'vitest'
import { hasRealSet, loggedExerciseIds } from '../history'
import { getWorkoutExercises } from '../../catalog/exercises'
import type { Session } from '../../types'

const s = (workout: Session['workout'], entries: Session['entries']): Session =>
  ({ workout, done: false, entries })

describe('hasRealSet', () => {
  it('counts a set with reps or with seconds', () => {
    expect(hasRealSet({ sets: [{ kg: 30, reps: 15 }], feltEasy: false })).toBe(true)
    expect(hasRealSet({ sets: [{ seconds: 30 }], feltEasy: false })).toBe(true)
  })

  it('does not count a weight-only prefill or an empty set list', () => {
    expect(hasRealSet({ sets: [{ kg: 30 }], feltEasy: false })).toBe(false)
    expect(hasRealSet({ sets: [], feltEasy: false })).toBe(false)
  })
})

describe('loggedExerciseIds', () => {
  it('is empty for no sessions', () => {
    expect(loggedExerciseIds({}).size).toBe(0)
  })

  it('collects ids across dates and workouts', () => {
    const sessions: Record<string, Session> = {
      '2026-06-02': s('A', { 'rdl': { sets: [{ kg: 60, reps: 10 }], feltEasy: false } }),
      '2026-06-06': s('B', { 'face-pull': { sets: [{ kg: 20, reps: 15 }], feltEasy: false } }),
    }
    expect([...loggedExerciseIds(sessions)].sort()).toEqual(['face-pull', 'rdl'])
  })

  it('ignores an opened-but-empty entry and a weight-only prefill', () => {
    const sessions: Record<string, Session> = {
      '2026-06-06': s('B', {
        'face-pull': { sets: [], feltEasy: false },
        'lat-pulldown': { sets: [{ kg: 40 }], feltEasy: false },
      }),
    }
    expect(loggedExerciseIds(sessions).size).toBe(0)
  })

  it('counts non-gym sessions too — an exercise logged is an exercise logged', () => {
    const sessions: Record<string, Session> = {
      '2026-06-04': s('rest', { 'plank': { sets: [{ seconds: 30 }], feltEasy: false } }),
    }
    expect(loggedExerciseIds(sessions).has('plank')).toBe(true)
  })

  it('tolerates a malformed entry from an old imported backup', () => {
    const sessions = { '2026-06-06': s('B', { 'face-pull': {} as never }) }
    expect(() => loggedExerciseIds(sessions)).not.toThrow()
    expect(loggedExerciseIds(sessions).size).toBe(0)
  })
})

describe('loggedExerciseIds + getWorkoutExercises (once trained, always yours)', () => {
  it('keeps a trained Face Pull visible after the program week drops below 9', () => {
    const sessions: Record<string, Session> = {
      '2026-06-06': s('B', { 'face-pull': { sets: [{ kg: 20, reps: 15 }], feltEasy: false } }),
    }
    const ids = getWorkoutExercises('B', 3, loggedExerciseIds(sessions)).map(e => e.id)
    expect(ids).toContain('face-pull')
  })

  it('an opened-but-empty Face Pull entry does not keep it visible below week 9', () => {
    const sessions: Record<string, Session> = {
      '2026-06-06': s('B', { 'face-pull': { sets: [], feltEasy: false } }),
    }
    const ids = getWorkoutExercises('B', 3, loggedExerciseIds(sessions)).map(e => e.id)
    expect(ids).not.toContain('face-pull')
  })
})
