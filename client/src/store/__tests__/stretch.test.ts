import { describe, it, expect } from 'vitest'
import { reducer } from '../reducer'
import { migrate, validateImport } from '../persistence'
import { EMPTY_STATE, SCHEMA_VERSION } from '@letsgetbuff/shared'

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o))

describe('stretch reducer', () => {
  it('LOG_STRETCH creates a session entry', () => {
    const s = reducer(EMPTY_STATE, { type: 'LOG_STRETCH', date: '2026-06-17', sessionId: 'daily', stretchId: 'quad', entry: { holds: [{ seconds: 30 }], level: 1, feltEasy: true } })
    expect(s.stretchSessions['2026-06-17'].entries.quad.level).toBe(1)
  })
  it('MARK / UNMARK stretch done', () => {
    let s = reducer(EMPTY_STATE, { type: 'MARK_STRETCH_DONE', date: 'd', sessionId: 'daily' })
    expect(s.stretchSessions['d'].done).toBe(true)
    s = reducer(s, { type: 'UNMARK_STRETCH_DONE', date: 'd' })
    expect(s.stretchSessions['d'].done).toBe(false)
  })
  it('SET_STRETCH_SCHEDULE toggles the flag', () => {
    expect(reducer(EMPTY_STATE, { type: 'SET_STRETCH_SCHEDULE', enabled: false }).stretchSchedule.enabled).toBe(false)
  })
  it('does not mutate input state', () => {
    const before = clone(EMPTY_STATE)
    reducer(EMPTY_STATE, { type: 'SET_STRETCH_SCHEDULE', enabled: false })
    expect(EMPTY_STATE).toEqual(before)
  })
})

describe('migration v2 -> v3', () => {
  const v2 = { schemaVersion: 2, startDate: '2026-06-01', skippedWeeks: [], sessions: {}, metrics: {}, milestones: {} }
  it('adds empty stretch log + default schedule', () => {
    const out = migrate(clone(v2), 2)
    expect(out.schemaVersion).toBe(SCHEMA_VERSION)
    expect(out.stretchSessions).toEqual({})
    expect(out.stretchSchedule).toEqual({ enabled: true })
  })
  it('an old v2 backup still imports', () => {
    expect(validateImport(clone(v2))).not.toBeNull()
  })
  it('EMPTY_STATE round-trips', () => {
    expect(validateImport(clone(EMPTY_STATE))).toEqual(EMPTY_STATE)
  })
})
