/**
 * Per-exercise rest mode: the together/turns choice is made once and remembered
 * per device, and the first-visit default comes from the plan rather than a
 * guess — timed and unloaded core work is done side by side, loaded work means
 * sharing a bar.
 */

import { test, expect, beforeEach } from 'vitest'
import type { ExerciseDef } from '@letsgetbuff/shared'
import { defaultRestMode, getRestMode, setRestMode, setRestSecs, getRestSecs, REST_MODE_KEY } from '../v2/restMode'

const base = { name: 'x', videoUrls: [], alternatives: [] }
const timed = { ...base, id: 'plank', progressionType: 'timed', requiresKg: false, safetyCues: [] } as unknown as ExerciseDef
const loaded = { ...base, id: 'row', progressionType: 'dumbbell', requiresKg: true, safetyCues: ['back'] } as unknown as ExerciseDef
const core = { ...base, id: 'deadbug', progressionType: 'bodyweight', requiresKg: false, safetyCues: ['back'] } as unknown as ExerciseDef

beforeEach(() => localStorage.clear())

test('defaults come from the plan', () => {
  expect(defaultRestMode(timed)).toBe('together')
  expect(defaultRestMode(core)).toBe('together')
  expect(defaultRestMode(loaded)).toBe('turns')
})

test('a chosen mode is remembered and beats the default', () => {
  expect(getRestMode(loaded)).toBe('turns')
  setRestMode(loaded.id, 'together')
  expect(getRestMode(loaded)).toBe('together')
  expect(JSON.parse(localStorage.getItem(REST_MODE_KEY)!)).toEqual({ row: { mode: 'together' } })
})

test('a per-exercise rest length lives alongside the mode', () => {
  setRestMode(timed.id, 'together')
  setRestSecs(timed.id, 45)
  expect(getRestSecs(timed.id)).toBe(45)
  expect(getRestMode(timed)).toBe('together')
  expect(getRestSecs('never-set')).toBeUndefined()
})

test('corrupt storage falls back to the plan default instead of throwing', () => {
  localStorage.setItem(REST_MODE_KEY, 'not json')
  expect(getRestMode(loaded)).toBe('turns')
})
