import { describe, it, expect } from 'vitest'
import { reducer } from '../reducer'
import { EMPTY_STATE, SCHEMA_VERSION, upgrade } from '@letsgetbuff/shared'

describe('user-added activities (schema v4)', () => {
  it('ADD_ACTIVITY appends to the date', () => {
    const s1 = reducer(EMPTY_STATE, { type: 'ADD_ACTIVITY', date: '2026-07-18', activity: { type: 'run', minutes: 30 } })
    const s2 = reducer(s1, { type: 'ADD_ACTIVITY', date: '2026-07-18', activity: { type: 'bike', minutes: 45 } })
    expect(s2.activities['2026-07-18']).toEqual([
      { type: 'run', minutes: 30 },
      { type: 'bike', minutes: 45 },
    ])
  })

  it('REMOVE_ACTIVITY removes by index and drops empty dates', () => {
    const s1 = reducer(EMPTY_STATE, { type: 'ADD_ACTIVITY', date: '2026-07-18', activity: { type: 'run', minutes: 30 } })
    const s2 = reducer(s1, { type: 'REMOVE_ACTIVITY', date: '2026-07-18', index: 0 })
    expect(s2.activities['2026-07-18']).toBeUndefined()
    expect(reducer(s2, { type: 'REMOVE_ACTIVITY', date: '2026-07-18', index: 0 })).toBe(s2)
  })

  it('a v3 blob without activities migrates to v4 with an empty map', () => {
    const v3 = {
      schemaVersion: 3, startDate: '2026-06-01', skippedWeeks: [], sessions: {},
      stretchSessions: {}, stretchSchedule: { enabled: true }, metrics: {}, milestones: {},
    }
    const out = upgrade(v3)!
    expect(out.schemaVersion).toBe(SCHEMA_VERSION)
    expect(out.activities).toEqual({})
    expect(out.stretchSchedule).toEqual({ enabled: true }) // preserved for round-trip
  })
})
