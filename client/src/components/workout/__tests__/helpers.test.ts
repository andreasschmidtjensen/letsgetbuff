import { describe, it, expect } from 'vitest'
import { parseWarmup } from '../helpers'

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
