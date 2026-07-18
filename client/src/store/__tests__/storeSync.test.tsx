/**
 * StoreProvider sync-engine tests — the most data-critical client logic:
 * server-wins load, debounced write-through PUT, offline retry, and the
 * first-login migration. react-dom + act under jsdom (no testing-library),
 * following the StartSessionModal.test pattern.
 */

import { test, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { StoreProvider, useStore, type SyncStatus } from '../store'
import { TestModeProvider } from '../testMode'
import { STORAGE_KEY } from '../persistence'
import { EMPTY_STATE, SCHEMA_VERSION } from '@letsgetbuff/shared'
import type { AppState } from '@letsgetbuff/shared'
import type { Action } from '../reducer'

beforeAll(() => {
  const g = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  g.IS_REACT_ACT_ENVIRONMENT = true
})

let container: HTMLElement | null = null
let root: Root | null = null

// Captured from the probe on every render
let ctx: { state: AppState; dispatch: (a: Action) => void; syncStatus: SyncStatus; pendingCount: number } | null = null

function Probe() {
  ctx = useStore()
  return null
}

function render(username = 'jacob') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(
      <TestModeProvider>
        <StoreProvider username={username}>
          <Probe />
        </StoreProvider>
      </TestModeProvider>,
    )
  })
}

const flush = () => act(async () => { await Promise.resolve() })

interface FetchLog { method: string; url: string; body?: unknown }
let fetchLog: FetchLog[] = []

// Route-based fetch mock. `putFails` makes PUT /api/state reject (network down).
function installFetch(opts: { serverState?: AppState | null; putFails?: () => boolean } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(init.body as string) : undefined
    fetchLog.push({ method, url: String(url), body })
    const u = String(url)
    if (u === '/api/state' && method === 'GET') {
      return { ok: true, json: async () => ({ state: opts.serverState ?? { ...EMPTY_STATE }, updatedAt: opts.serverState ? '2026-01-01T00:00:00Z' : null }) }
    }
    if (u === '/api/state' && method === 'PUT') {
      if (opts.putFails?.()) throw new TypeError('network down')
      return { ok: true, json: async () => ({ ok: true, updatedAt: 'now' }) }
    }
    if (u === '/api/plan') return { ok: false, json: async () => ({}) }
    throw new Error('unexpected fetch: ' + method + ' ' + u)
  }))
}

const serverState = (over: Partial<AppState>): AppState => ({ ...EMPTY_STATE, ...over })

beforeEach(() => {
  localStorage.clear()
  fetchLog = []
  vi.useFakeTimers()
})

afterEach(() => {
  act(() => { root?.unmount() })
  container?.remove()
  container = null
  root = null
  ctx = null
  vi.useRealTimers()
  vi.restoreAllMocks()
})

test('server data wins on mount and refreshes the local cache', async () => {
  installFetch({ serverState: serverState({ startDate: '2026-01-05' }) })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serverState({ startDate: '2020-12-31' })))

  render()
  await flush()

  expect(ctx!.state.startDate).toBe('2026-01-05')
  expect(ctx!.syncStatus).toBe('synced')
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).startDate).toBe('2026-01-05')
})

test('a state change PUTs to the server after the 1s debounce', async () => {
  installFetch({ serverState: serverState({ startDate: '2026-01-05' }) })
  render()
  await flush()

  act(() => { ctx!.dispatch({ type: 'SET_START_DATE', date: '2026-02-02' }) })
  expect(fetchLog.filter(f => f.method === 'PUT')).toHaveLength(0) // debounce pending
  expect(ctx!.pendingCount).toBe(1)

  await act(async () => { await vi.advanceTimersByTimeAsync(1100) })

  const puts = fetchLog.filter(f => f.method === 'PUT' && f.url === '/api/state')
  expect(puts).toHaveLength(1)
  expect((puts[0].body as { state: AppState }).state.startDate).toBe('2026-02-02')
  expect(ctx!.pendingCount).toBe(0)
  expect(ctx!.syncStatus).toBe('synced')
})

test('a failed PUT keeps the change pending and the retry loop flushes it', async () => {
  let failing = true
  installFetch({ serverState: serverState({ startDate: '2026-01-05' }), putFails: () => failing })
  render()
  await flush()

  act(() => { ctx!.dispatch({ type: 'SET_START_DATE', date: '2026-03-03' }) })
  await act(async () => { await vi.advanceTimersByTimeAsync(1100) })

  expect(ctx!.pendingCount).toBe(1)
  expect(['offline', 'error']).toContain(ctx!.syncStatus)
  // Local cache still has the edit — nothing is lost while offline.
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).startDate).toBe('2026-03-03')

  failing = false
  await act(async () => { await vi.advanceTimersByTimeAsync(30100) }) // retry interval

  expect(ctx!.pendingCount).toBe(0)
  expect(ctx!.syncStatus).toBe('synced')
  const puts = fetchLog.filter(f => f.method === 'PUT' && f.url === '/api/state')
  expect((puts.at(-1)!.body as { state: AppState }).state.startDate).toBe('2026-03-03')
})

test('first login pushes existing local data to an empty server exactly once', async () => {
  installFetch({ serverState: null })
  const local = serverState({ startDate: '2025-11-11', schemaVersion: SCHEMA_VERSION })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(local))

  render('jacob')
  await flush()

  const puts = fetchLog.filter(f => f.method === 'PUT' && f.url === '/api/state')
  expect(puts).toHaveLength(1)
  expect((puts[0].body as { state: AppState }).state.startDate).toBe('2025-11-11')
  expect(localStorage.getItem('letsgetbuff-migrated-jacob')).toBe('1')
  expect(ctx!.state.startDate).toBe('2025-11-11')
  expect(ctx!.syncStatus).toBe('synced')
})
