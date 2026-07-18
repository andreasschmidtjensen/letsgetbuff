// Canonical AppState migration ladder — the single source of truth shared by
// the client (localStorage cache + import/export) and the server (every read
// and write path). Keeping one copy is deliberate: a server that stored blobs
// verbatim while only the client migrated is exactly the bug class that blanked
// the app (see memory/server-state-needs-migration.md). Both sides run this.

import { AppState, SCHEMA_VERSION } from '../types.js'

// Exercise ids that used to exist in the catalog but were removed.
const REMOVED_EXERCISE_IDS = ['back-extension', 'tricep-pushdown', 'bird-dog']

type Migration = (state: Record<string, unknown>) => Record<string, unknown>

const MIGRATIONS: Record<number, Migration> = {
  // 1 -> 2: strip logged entries for removed exercises.
  1: (state) => {
    const sessionsIn = (state.sessions ?? {}) as Record<string, { entries?: Record<string, unknown> }>
    const sessionsOut: Record<string, unknown> = {}
    for (const [date, session] of Object.entries(sessionsIn)) {
      const entriesOut: Record<string, unknown> = {}
      for (const [exId, entry] of Object.entries(session.entries ?? {})) {
        if (!REMOVED_EXERCISE_IDS.includes(exId)) entriesOut[exId] = entry
      }
      sessionsOut[date] = { ...session, entries: entriesOut }
    }
    return { ...state, sessions: sessionsOut }
  },
  // 2 -> 3: introduce the optional stretch log + schedule preference. Purely additive.
  2: (state) => ({
    ...state,
    stretchSessions: (state.stretchSessions ?? {}),
    stretchSchedule: (state.stretchSchedule ?? { enabled: true }),
  }),
  // 3 -> 4: user-added activities (run/bike/stretch per date). Purely additive;
  // stretchSchedule stays in the shape so old backups round-trip untouched.
  3: (state) => ({
    ...state,
    activities: (state.activities ?? {}),
  }),
}

// Run the migration ladder from `fromVersion` up to SCHEMA_VERSION.
export function migrate(state: Record<string, unknown>, fromVersion: number): AppState {
  let s = state
  for (let v = fromVersion; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v]
    if (!step) throw new Error(`No migration path from schema version ${v}`)
    s = step(s)
  }
  s.schemaVersion = SCHEMA_VERSION
  return s as unknown as AppState
}

// Shape check that a parsed blob is a plausible AppState. Tolerant:
// stretchSessions / stretchSchedule are NOT required here, so pre-v3 backups
// still pass (the 2->3 migration fills them in).
export function isPlausibleState(raw: unknown): raw is Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null) return false
  const o = raw as Record<string, unknown>
  return (
    typeof o.sessions === 'object' && o.sessions !== null &&
    typeof o.metrics === 'object' && o.metrics !== null &&
    typeof o.milestones === 'object' && o.milestones !== null &&
    Array.isArray(o.skippedWeeks)
  )
}

// Bring a parsed blob up to the current schema, or return null if unrecognisable
// (unknown shape, or a schemaVersion newer than this build understands).
export function upgrade(raw: unknown): AppState | null {
  if (!isPlausibleState(raw)) return null
  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0
  if (version > SCHEMA_VERSION) return null
  if (version === SCHEMA_VERSION) return raw as unknown as AppState
  try {
    return migrate(raw, version)
  } catch {
    return null
  }
}
