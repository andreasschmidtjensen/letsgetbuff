/**
 * Per-side sets and the export/import contract.
 *
 * The two halves of a per-side set live in ONE `SetEntry`: the outer entry is
 * the left side, `.right` the second half. That keeps one entry per logical set,
 * so a session started on v2 still reads correctly in the classic UI, and the
 * field is optional, so the JSON export contract is unchanged.
 */

import { test, expect } from 'vitest'
import { EMPTY_STATE, SCHEMA_VERSION, repTargetFor, getWorkoutExercises } from '@letsgetbuff/shared'
import type { AppState, ExerciseDef, SetEntry } from '@letsgetbuff/shared'
import { validateImport } from '../../../store/persistence'
import { exerciseDoneInV2, setComplete, sidesLogged, formatLoggedSet } from '../v2/helpers'
import { exerciseDoneIn } from '../helpers'

function perSideExercise(): ExerciseDef {
  const all = [...getWorkoutExercises('A', 1), ...getWorkoutExercises('B', 1)]
  const ex = all.find(e => e.perSide)
  if (!ex) throw new Error('the catalog has no per-side exercise to test')
  return ex
}

test('a set counts only when both sides are logged', () => {
  const ex = perSideExercise()
  const target = repTargetFor(ex, 1)
  const value = target.seconds !== undefined ? { seconds: target.seconds } : { reps: target.reps }

  const leftOnly: SetEntry = { ...value }
  expect(setComplete(leftOnly, ex)).toBe(false)
  expect(sidesLogged(leftOnly, ex)).toBe(1)

  const both: SetEntry = { ...value, right: { ...value } }
  expect(setComplete(both, ex)).toBe(true)
  expect(sidesLogged(both, ex)).toBe(2)
})

test('exerciseDoneInV2 needs both sides of every set; v1 only needs one entry each', () => {
  const ex = perSideExercise()
  const target = repTargetFor(ex, 1)
  const value = target.seconds !== undefined ? { seconds: target.seconds } : { reps: target.reps }

  const halfLogged = Array.from({ length: target.sets }, () => ({ ...value }))
  const sessions = { '2026-08-29': { workout: 'A' as const, done: false, entries: { [ex.id]: { sets: halfLogged, feltEasy: false } } } }
  expect(exerciseDoneInV2(sessions, '2026-08-29', ex, 1)).toBe(false)
  // v1 counts one entry per set, so it reads the same number of SETS — the
  // point of the nested shape: v2 never inflates v1's counter.
  expect(exerciseDoneIn(sessions, '2026-08-29', ex, 1)).toBe(true)

  const full = halfLogged.map(s => ({ ...s, right: { ...value } }))
  const done = { '2026-08-29': { workout: 'A' as const, done: false, entries: { [ex.id]: { sets: full, feltEasy: false } } } }
  expect(exerciseDoneInV2(done, '2026-08-29', ex, 1)).toBe(true)
})

test('a v2 export round-trips into v1 byte-identically, per-side halves included', () => {
  const ex = perSideExercise()
  const state: AppState = {
    ...EMPTY_STATE,
    schemaVersion: SCHEMA_VERSION,
    startDate: '2026-08-01',
    sessions: {
      '2026-08-29': {
        workout: 'A',
        done: false,
        entries: {
          [ex.id]: { sets: [{ seconds: 30, right: { seconds: 28 } }, { kg: 12, reps: 10, rir: 2, right: { reps: 9 } }], feltEasy: false },
        },
      },
    },
  }

  const exported = JSON.stringify(state)
  const imported = validateImport(JSON.parse(exported))
  expect(imported).not.toBeNull()
  expect(JSON.stringify(imported)).toBe(exported)
  expect(imported!.sessions['2026-08-29'].entries[ex.id].sets[0].right).toEqual({ seconds: 28 })
})

test('an old backup that predates per-side still imports', () => {
  const old = {
    schemaVersion: 1,
    startDate: '2025-01-06',
    skippedWeeks: [],
    sessions: { '2025-01-07': { workout: 'A', done: true, entries: { plank: { sets: [{ seconds: 30 }], feltEasy: false } } } },
    metrics: {},
    milestones: {},
  }
  const imported = validateImport(old)
  expect(imported).not.toBeNull()
  expect(imported!.schemaVersion).toBe(SCHEMA_VERSION)
  expect(imported!.sessions['2025-01-07'].entries.plank.sets[0].seconds).toBe(30)
  expect(imported!.sessions['2025-01-07'].entries.plank.sets[0].right).toBeUndefined()
})

test('a logged per-side set reads back as both halves', () => {
  const ex = perSideExercise()
  expect(formatLoggedSet({ seconds: 30, right: { seconds: 27 } }, ex)).toBe('30s / 27s')
  expect(formatLoggedSet({ seconds: 30 }, ex)).toBe('30s / —')
})
