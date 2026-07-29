/**
 * Guest mode — the contract is "everything works, nothing is saved". These
 * tests pin the write paths shut: no PUT /api/state, no localStorage, and the
 * signed-in user's cached data is never loaded into a guest session.
 */

import { test, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { StoreProvider, useStore, type SyncStatus } from '../store'
import { TestModeProvider } from '../testMode'
import { STORAGE_KEY, saveLocalState, putServerState, sendProxyLog } from '../persistence'
import { setGuestMode, guestSeedState, GUEST_USERNAME } from '../guest'
import { EMPTY_STATE } from '@letsgetbuff/shared'
import type { AppState } from '@letsgetbuff/shared'
import type { Action } from '../reducer'

beforeAll(() => {
  const g = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  g.IS_REACT_ACT_ENVIRONMENT = true
})

let container: HTMLElement | null = null
let root: Root | null = null
let ctx: { state: AppState; dispatch: (a: Action) => void; syncStatus: SyncStatus; pendingCount: number } | null = null

function Probe() {
  ctx = useStore()
  return null
}

function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(
      <TestModeProvider>
        <StoreProvider username={GUEST_USERNAME}>
          <Probe />
        </StoreProvider>
      </TestModeProvider>,
    )
  })
}

let fetchLog: { method: string; url: string }[] = []

function installFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    fetchLog.push({ method: init?.method ?? 'GET', url: String(url) })
    if (String(url) === '/api/plan') return { ok: false, json: async () => ({}) }
    throw new Error('unexpected fetch in guest mode: ' + init?.method + ' ' + url)
  }))
}

beforeEach(() => {
  localStorage.clear()
  fetchLog = []
  setGuestMode(true)
  vi.useFakeTimers()
})

afterEach(() => {
  act(() => { root?.unmount() })
  container?.remove()
  container = null
  root = null
  ctx = null
  setGuestMode(false)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

test('a guest session seeds a demo start date and never loads the cached account', async () => {
  installFetch()
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...EMPTY_STATE, startDate: '2020-12-31' }))

  render()
  await act(async () => { await Promise.resolve() })

  expect(ctx!.state.startDate).toBe(guestSeedState().startDate)
  expect(ctx!.state.startDate).not.toBe('2020-12-31')
  expect(ctx!.syncStatus).toBe('guest')
  // Only the public shared plan is fetched — no /api/state, no /api/me.
  expect(fetchLog.every(f => f.url === '/api/plan' && f.method === 'GET')).toBe(true)
})

test('logging as a guest writes nothing to the server or localStorage', async () => {
  installFetch()
  render()
  await act(async () => { await Promise.resolve() })

  act(() => { ctx!.dispatch({ type: 'MARK_DAY_DONE', date: '2026-07-28', workout: 'A' }) })
  await act(async () => { await vi.advanceTimersByTimeAsync(40000) }) // past debounce + retry

  expect(ctx!.state.sessions['2026-07-28']?.done).toBe(true)   // in memory it worked
  expect(fetchLog.filter(f => f.method !== 'GET')).toHaveLength(0)
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
})

test('the persistence layer itself refuses to write in guest mode', async () => {
  saveLocalState({ ...EMPTY_STATE, startDate: '2026-01-01' })
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

  await expect(putServerState({ ...EMPTY_STATE })).rejects.toThrow(/[Gg]uest/)

  await expect(
    sendProxyLog({ sessionId: 1, date: '2026-07-28', exerciseId: 'squat', workout: 'A', entry: {} }),
  ).resolves.toBe(false)
  expect(localStorage.getItem('letsgetbuff-proxy-queue')).toBeNull()
})
