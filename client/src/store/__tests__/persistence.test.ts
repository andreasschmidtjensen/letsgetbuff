import { describe, it, expect } from 'vitest'
import { migrate, validateImport } from '../persistence'
import { SCHEMA_VERSION, EMPTY_STATE } from '@letsgetbuff/shared'

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))

// A realistic version-1 blob that references three exercise ids removed from the
// catalog (back-extension, tricep-pushdown, bird-dog) alongside a surviving one.
const v1State = {
  schemaVersion: 1,
  startDate: '2026-06-01',
  skippedWeeks: ['2026-W24'],
  sessions: {
    '2026-06-02': {
      workout: 'B',
      done: true,
      entries: {
        'single-arm-row': { sets: [{ kg: 10, reps: 10 }], feltEasy: false },
        'back-extension': { sets: [{ reps: 12 }], feltEasy: false },
        'tricep-pushdown': { sets: [{ kg: 20, reps: 12 }], feltEasy: true },
        'bird-dog': { sets: [{ reps: 10 }], feltEasy: false },
      },
    },
  },
  metrics: { '2026-06-02': { bodyweightKg: 80 } },
  milestones: { 'energy-up': true },
}

describe('migrate (ladder)', () => {
  it('upgrades v1 -> current and drops removed exercise ids', () => {
    const out = migrate(clone(v1State), 1)
    expect(out.schemaVersion).toBe(SCHEMA_VERSION)
    const entries = out.sessions['2026-06-02'].entries
    expect(Object.keys(entries)).toEqual(['single-arm-row'])
    expect(entries['back-extension']).toBeUndefined()
    expect(entries['tricep-pushdown']).toBeUndefined()
    expect(entries['bird-dog']).toBeUndefined()
  })

  it('does not wipe surviving data', () => {
    const out = migrate(clone(v1State), 1)
    expect(out.startDate).toBe('2026-06-01')
    expect(out.skippedWeeks).toEqual(['2026-W24'])
    expect(out.sessions['2026-06-02'].done).toBe(true)
    expect(out.sessions['2026-06-02'].entries['single-arm-row'].sets[0].kg).toBe(10)
    expect(out.metrics['2026-06-02'].bodyweightKg).toBe(80)
    expect(out.milestones['energy-up']).toBe(true)
  })

  it('is a no-op when already at the current version', () => {
    const current = clone({ ...EMPTY_STATE })
    expect(migrate(current, SCHEMA_VERSION)).toEqual(EMPTY_STATE)
  })
})

describe('validateImport', () => {
  it('upgrades an older export instead of rejecting it', () => {
    const result = validateImport(clone(v1State))
    expect(result).not.toBeNull()
    expect(result!.schemaVersion).toBe(SCHEMA_VERSION)
    expect(result!.sessions['2026-06-02'].entries['bird-dog']).toBeUndefined()
  })

  it('accepts current-version data unchanged', () => {
    const current = clone({ ...EMPTY_STATE })
    expect(validateImport(current)).toEqual(EMPTY_STATE)
  })

  it('rejects unrecognisable data', () => {
    expect(validateImport(null)).toBeNull()
    expect(validateImport(42)).toBeNull()
    expect(validateImport({ foo: 'bar' })).toBeNull()
    expect(validateImport({ schemaVersion: 1 })).toBeNull() // plausible version, missing containers
  })

  it('rejects data from a newer, unknown schema version', () => {
    const future = clone({ ...EMPTY_STATE, schemaVersion: SCHEMA_VERSION + 1 })
    expect(validateImport(future)).toBeNull()
  })
})
