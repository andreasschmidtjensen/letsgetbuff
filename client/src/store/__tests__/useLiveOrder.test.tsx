/**
 * useLiveOrder hook tests — session resolution, optimistic reorder with the
 * version guard, stale snap-back, and partner presence. WebSocket is a manual
 * mock; fetch resolves the solo-session POST.
 */

import { test, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { useLiveOrder, type UseLiveOrderResult } from '../useLiveOrder'

beforeAll(() => {
  const g = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  g.IS_REACT_ACT_ENVIRONMENT = true
})

class MockWS {
  static instances: MockWS[] = []
  static OPEN = 1
  url: string
  readyState = 0
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  constructor(url: string) {
    this.url = url
    MockWS.instances.push(this)
  }
  send(data: string) { this.sent.push(data) }
  close() { this.readyState = 3; this.onclose?.() }
  serverOpen() { this.readyState = MockWS.OPEN; this.onopen?.() }
  serverSend(msg: unknown) { this.onmessage?.({ data: JSON.stringify(msg) }) }
  lastSent(): Record<string, unknown> { return JSON.parse(this.sent.at(-1)!) }
}

let container: HTMLElement | null = null
let root: Root | null = null
let result: UseLiveOrderResult | null = null

function Probe() {
  result = useLiveOrder({
    planOrder: ['a', 'b', 'c'],
    date: '2026-07-18',
    workoutType: 'B',
    username: 'jacob',
    enabled: true,
  })
  return null
}

const flush = () => act(async () => { await Promise.resolve() })

async function renderHook() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => { root!.render(<Probe />) })
  await flush() // resolve POST /api/session
  await flush() // let the seeded sessionId open the socket
}

beforeEach(() => {
  MockWS.instances = []
  result = null
  vi.stubGlobal('WebSocket', MockWS)
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url) === '/api/session' && init?.method === 'POST') {
      return { ok: true, json: async () => ({ session: { id: 5 }, order: ['b', 'a', 'c'], version: 2 }) }
    }
    throw new Error('unexpected fetch: ' + String(url))
  }))
})

afterEach(() => {
  act(() => { root?.unmount() })
  container?.remove()
  container = null
  root = null
  vi.restoreAllMocks()
})

test('auto-creates a solo session and seeds order + version from it', async () => {
  await renderHook()
  expect(result!.sessionId).toBe(5)
  expect(result!.order).toEqual(['b', 'a', 'c'])
  expect(MockWS.instances).toHaveLength(1)
  expect(MockWS.instances[0].url).toContain('/ws?sessionId=5')
})

test('reorder is optimistic and sends the server-confirmed version', async () => {
  await renderHook()
  const ws = MockWS.instances[0]
  act(() => { ws.serverOpen() })
  expect(result!.wsStatus).toBe('open')

  // Server pushes a newer order first — the guard must base on ITS version.
  act(() => { ws.serverSend({ type: 'order', order: ['c', 'b', 'a'], version: 7 }) })
  expect(result!.order).toEqual(['c', 'b', 'a'])

  act(() => { result!.reorder(['a', 'c', 'b']) })
  expect(result!.order).toEqual(['a', 'c', 'b']) // optimistic
  const msg = ws.lastSent()
  expect(msg.type).toBe('reorder')
  expect(msg.basedOnVersion).toBe(7)
  expect(msg.order).toEqual(['a', 'c', 'b'])
})

test('a stale reorder snaps back to the server order', async () => {
  await renderHook()
  const ws = MockWS.instances[0]
  act(() => { ws.serverOpen() })

  act(() => { result!.reorder(['c', 'a', 'b']) }) // optimistic local
  // Server rejects (stale) and replies with the authoritative order.
  act(() => { ws.serverSend({ type: 'order', order: ['b', 'a', 'c'], version: 3 }) })
  expect(result!.order).toEqual(['b', 'a', 'c'])
})

test('partner presence tracks the other user and ignores self', async () => {
  await renderHook()
  const ws = MockWS.instances[0]
  act(() => { ws.serverOpen() })

  act(() => { ws.serverSend({ type: 'presence', user: 'partner', exerciseId: 'a' }) })
  act(() => { ws.serverSend({ type: 'presence', user: 'jacob', exerciseId: 'b' }) }) // self — ignored
  expect(result!.partnerPresence.get('partner')).toBe('a')
  expect(result!.partnerPresence.has('jacob')).toBe(false)

  act(() => { ws.serverSend({ type: 'presence', user: 'partner', exerciseId: null }) })
  expect(result!.partnerPresence.has('partner')).toBe(false)
})
