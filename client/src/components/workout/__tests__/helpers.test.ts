import { describe, it, expect } from 'vitest'
import type { ExerciseDef } from '@letsgetbuff/shared'
import { parseWarmup, formatSet } from '../helpers'
import { formatSide } from '../v2/helpers'

describe('parseWarmup', () => {
  it('returns null for empty input', () => {
    expect(parseWarmup(undefined)).toBeNull()
    expect(parseWarmup('  ')).toBeNull()
  })

  it('parses a single cardio warmup', () => {
    expect(parseWarmup('10-minute elliptical')).toEqual([
      { label: '10-minute elliptical', seconds: 600 },
    ])
  })

  it('parses the interleaved rowing warmup (row → plank → row → plank)', () => {
    expect(parseWarmup('5-minute rowing, then 30-second reverse plank, then 5-minute rowing, then 30-second reverse plank')).toEqual([
      { label: '5-minute rowing', seconds: 300 },
      { label: '30-second reverse plank', seconds: 30, videoId: 'hS_KCFjbWKQ', vertical: true },
      { label: '5-minute rowing', seconds: 300 },
      { label: '30-second reverse plank', seconds: 30, videoId: 'hS_KCFjbWKQ', vertical: true },
    ])
  })

  it('expands a 2x multiplier into two labelled sets (Workout A warmup)', () => {
    expect(parseWarmup('10-minute elliptical, then 2x 30-second reverse plank')).toEqual([
      { label: '10-minute elliptical', seconds: 600 },
      { label: '30-second reverse plank (1/2)', seconds: 30, videoId: 'hS_KCFjbWKQ', vertical: true },
      { label: '30-second reverse plank (2/2)', seconds: 30, videoId: 'hS_KCFjbWKQ', vertical: true },
    ])
  })

  it('defaults an unnumbered step to 5 minutes', () => {
    expect(parseWarmup('light cycling')).toEqual([
      { label: 'light cycling', seconds: 300 },
    ])
  })
})

describe('formatSet / formatSide — load-mode suffix', () => {
  const base: ExerciseDef = {
    id: 'x', name: 'X', sets: 3, reps: 10, progressionType: 'dumbbell',
    requiresKg: true, videoUrls: [], alternatives: [], notes: '', safetyCues: [],
  }

  it('appends the per-hand / single-dumbbell suffix', () => {
    expect(formatSet({ kg: 12, reps: 10 }, { ...base, load: 'perHand' })).toBe('12kg/hand x10')
    expect(formatSet({ kg: 14, reps: 12 }, { ...base, load: 'single' })).toBe('14kg (1 DB) x12')
    expect(formatSide({ kg: 12, reps: 10 }, { ...base, load: 'perHand' })).toBe('12kg/hand ×10')
  })

  it('total and unlabeled (pre-v5 plan rows) render exactly as before', () => {
    expect(formatSet({ kg: 60, reps: 10 }, { ...base, load: 'total' })).toBe('60kg x10')
    expect(formatSet({ kg: 60, reps: 10 }, base)).toBe('60kg x10')
    expect(formatSide({ kg: 60, reps: 10 }, base)).toBe('60kg ×10')
  })

  it('unweighted sets are unaffected', () => {
    expect(formatSet({ seconds: 30 }, { ...base, requiresKg: false, reps: null })).toBe('30s')
  })
})
