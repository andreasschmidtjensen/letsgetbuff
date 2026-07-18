import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sendProxyLog, flushProxyQueue, PROXY_QUEUE_KEY } from '../persistence'

const payload = (exerciseId: string) => ({
  sessionId: 1, date: '2026-07-18', exerciseId, workout: 'A',
  entry: { sets: [{ kg: 10, reps: 10 }], feltEasy: false },
})

const queued = (): unknown[] => JSON.parse(localStorage.getItem(PROXY_QUEUE_KEY) ?? '[]')

describe('proxy-log retry queue', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('queues the entry when the network is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    expect(await sendProxyLog(payload('rdl'))).toBe(false)
    expect(queued()).toHaveLength(1)
  })

  it('latest write per (session, date, exercise) wins in the queue', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await sendProxyLog(payload('rdl'))
    await sendProxyLog({ ...payload('rdl'), entry: { sets: [{ kg: 12, reps: 8 }], feltEasy: true } })
    await sendProxyLog(payload('plank'))
    expect(queued()).toHaveLength(2)
  })

  it('flush clears the queue once the server accepts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await sendProxyLog(payload('rdl'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
    expect(await flushProxyQueue()).toBe(0)
    expect(queued()).toHaveLength(0)
  })

  it('flush keeps entries when the server is still unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await sendProxyLog(payload('rdl'))
    expect(await flushProxyQueue()).toBe(1)
    expect(queued()).toHaveLength(1)
  })

  it('a 4xx rejection is dropped, not retried forever', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await sendProxyLog(payload('rdl'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))
    expect(await flushProxyQueue()).toBe(0)
    expect(queued()).toHaveLength(0)
  })
})
