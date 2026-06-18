import { AppState, SCHEMA_VERSION } from '@letsgetbuff/shared'
import { todayKey } from '../lib/date'

export const STORAGE_KEY = 'letsgetbuff-v1'

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

function isPlausibleState(raw: unknown): raw is Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null) return false
  const o = raw as Record<string, unknown>
  // Tolerant: stretchSessions / stretchSchedule are NOT required here, so pre-v3
  // backups still import (the 2->3 migration fills them in).
  return (
    typeof o.sessions === 'object' && o.sessions !== null &&
    typeof o.metrics === 'object' && o.metrics !== null &&
    typeof o.milestones === 'object' && o.milestones !== null &&
    Array.isArray(o.skippedWeeks)
  )
}

// Bring a parsed blob up to the current schema, or return null if unrecognisable.
function upgrade(raw: unknown): AppState | null {
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

// localStorage (offline cache)

export function loadLocalState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    const upgraded = upgrade(parsed)
    if (!upgraded) {
      console.error('letsgetbuff: stored data could not be migrated; ignoring.', parsed)
      return null
    }
    return upgraded
  } catch (e) {
    console.error('letsgetbuff: failed to read stored data.', e)
    return null
  }
}

export function saveLocalState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

// Server sync

export interface ServerStateResponse {
  state: AppState
  updatedAt: string | null
}

export async function fetchServerState(): Promise<ServerStateResponse> {
  const res = await fetch('/api/state', { credentials: 'include' })
  if (!res.ok) throw new Error(`GET /api/state failed: ${res.status}`)
  return res.json() as Promise<ServerStateResponse>
}

export async function putServerState(state: AppState): Promise<{ ok: boolean; updatedAt: string }> {
  const res = await fetch('/api/state', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  })
  if (!res.ok) throw new Error(`PUT /api/state failed: ${res.status}`)
  return res.json() as Promise<{ ok: boolean; updatedAt: string }>
}

// Migration tracking

export function isMigrated(username: string): boolean {
  return localStorage.getItem(`letsgetbuff-migrated-${username}`) === '1'
}

export function markMigrated(username: string): void {
  localStorage.setItem(`letsgetbuff-migrated-${username}`, '1')
}

// Export / Import

export function exportData(state: AppState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `letsgetbuff-backup-${todayKey()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function validateImport(raw: unknown): AppState | null {
  return upgrade(raw)
}
