import { AppState, todayKey, migrate, upgrade } from '@letsgetbuff/shared'
import { isGuestMode } from './guest'

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
  // Guest mode: never touch the cache — it belongs to the signed-in account and
  // a guest session must leave no trace.
  if (isGuestMode()) return
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
  // Guest mode has no account to write to. Callers are already gated; this is
  // the backstop so a missed guard can never persist a guest's data.
  if (isGuestMode()) throw new Error('Guest mode: server writes are disabled')
  const res = await fetch('/api/state', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  })
  if (!res.ok) throw new Error(`PUT /api/state failed: ${res.status}`)
  return res.json() as Promise<{ ok: boolean; updatedAt: string }>
}

// Proxy-log queue (shared sessions). A set logged FOR the partner has no place
// in our own AppState, so a failed PUT /api/proxy-log used to vanish silently.
// Failed payloads are queued here and retried by the store's sync loop; latest
// write per (session, date, exercise) wins, matching the server's merge.

export const PROXY_QUEUE_KEY = 'letsgetbuff-proxy-queue'

export interface ProxyLogPayload {
  sessionId: number
  date: string
  exerciseId: string
  workout: string
  entry: unknown
}

function readProxyQueue(): ProxyLogPayload[] {
  try {
    const raw = localStorage.getItem(PROXY_QUEUE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as ProxyLogPayload[]) : []
  } catch {
    return []
  }
}

function writeProxyQueue(queue: ProxyLogPayload[]): void {
  if (queue.length === 0) localStorage.removeItem(PROXY_QUEUE_KEY)
  else localStorage.setItem(PROXY_QUEUE_KEY, JSON.stringify(queue))
}

function enqueueProxyLog(payload: ProxyLogPayload): void {
  const queue = readProxyQueue().filter(
    p => !(p.sessionId === payload.sessionId && p.date === payload.date && p.exerciseId === payload.exerciseId),
  )
  queue.push(payload)
  writeProxyQueue(queue)
}

async function attemptProxyLog(payload: ProxyLogPayload): Promise<boolean> {
  const res = await fetch('/api/proxy-log', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (res.ok) return true
  if (res.status >= 500) throw new Error(`PUT /api/proxy-log failed: ${res.status}`)
  // 4xx (session ended, privilege revoked, bad payload): retrying won't help.
  console.warn('[proxy-log] rejected by server, dropping', res.status)
  return false
}

// Send one proxy entry; on network/server failure queue it for the retry loop.
// Resolves true only when the server accepted the write.
export async function sendProxyLog(payload: ProxyLogPayload): Promise<boolean> {
  if (isGuestMode()) return false   // guests never join shared sessions
  try {
    return await attemptProxyLog(payload)
  } catch {
    enqueueProxyLog(payload)
    return false
  }
}

// Retry everything queued; keeps whatever still fails. Returns the number of
// entries remaining in the queue.
export async function flushProxyQueue(): Promise<number> {
  if (isGuestMode()) return 0
  const queue = readProxyQueue()
  if (queue.length === 0) return 0
  const remaining: ProxyLogPayload[] = []
  for (const payload of queue) {
    try {
      await attemptProxyLog(payload) // 4xx drops, ok clears — only throws re-queue
    } catch {
      remaining.push(payload)
    }
  }
  writeProxyQueue(remaining)
  return remaining.length
}

// Migration tracking

export function isMigrated(username: string): boolean {
  return localStorage.getItem(`letsgetbuff-migrated-${username}`) === '1'
}

export function markMigrated(username: string): void {
  if (isGuestMode()) return
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
