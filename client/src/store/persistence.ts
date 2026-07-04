import { AppState, todayKey, migrate, upgrade } from '@letsgetbuff/shared'

// The migration ladder (`migrate`/`upgrade`) now lives in @letsgetbuff/shared so
// the server runs the identical steps on every read/write path — see
// shared/src/lib/migrate.ts. Re-exported here for existing importers/tests.
export { migrate, upgrade }

export const STORAGE_KEY = 'letsgetbuff-v1'

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
  const body = (await res.json()) as ServerStateResponse
  // Server blobs are migrated through the same ladder as local cache — a pre-v3
  // server state lacks stretchSessions/stretchSchedule, which would crash views
  // that read them. Fall back to the raw blob only if it's unrecognisable.
  const upgraded = upgrade(body.state)
  return { ...body, state: upgraded ?? body.state }
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
