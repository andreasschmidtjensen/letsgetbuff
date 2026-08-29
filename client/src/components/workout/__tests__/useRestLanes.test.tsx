/**
 * The rest dock's engine. Two people resting must get two independent
 * countdowns; resting together must be one lane that a second person JOINS
 * rather than restarts; and a reload mid-rest must restore both with the right
 * time left, because the lanes are wall-clock deadlines, not tick counts.
 */

import { test, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { useRestLanes, REST_LANES_KEY, TOGETHER_KEY } from '../v2/useRestLanes'

vi.mock('../../../lib/sounds', () => ({ playTimerEnd: vi.fn() }))

beforeAll(() => {
  const g = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  g.IS_REACT_ACT_ENVIRONMENT = true
})

type Api = ReturnType<typeof useRestLanes>
let api: Api | null = null
let root: Root | null = null

function Probe() {
  api = useRestLanes({ muted: true, audioCtx: null })
  return null
}

function render() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => { root!.render(<Probe />) })
}

function laneFor(key: string) {
  return api!.lanes.find(l => l.key === key)
}

beforeEach(() => {
  localStorage.clear()
  api = null
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-29T10:00:00Z'))
})

afterEach(() => {
  act(() => { root?.unmount() })
  root = null
  vi.useRealTimers()
})

test('two lanes run independently', () => {
  render()
  act(() => { api!.start('andreas', ['andreas'], 90) })
  act(() => { vi.advanceTimersByTime(30_000) })
  act(() => { api!.start('partner', ['partner'], 90) })
  act(() => { vi.advanceTimersByTime(10_000) })

  expect(laneFor('andreas')!.remaining).toBe(50)
  expect(laneFor('partner')!.remaining).toBe(80)

  // Skipping one leaves the other running.
  act(() => { api!.clear('andreas') })
  expect(laneFor('andreas')).toBeUndefined()
  expect(laneFor('partner')!.remaining).toBe(80)
})

test('together mode: a second confirm joins the window instead of restarting it', () => {
  render()
  act(() => { api!.startOrJoin(TOGETHER_KEY, ['andreas'], 90) })
  act(() => { vi.advanceTimersByTime(40_000) })
  act(() => { api!.startOrJoin(TOGETHER_KEY, ['partner'], 90) })

  const lane = laneFor(TOGETHER_KEY)!
  expect(lane.remaining).toBe(50)
  expect(lane.names).toEqual(['andreas', 'partner'])
})

test('a finished together window starts fresh on the next confirm', () => {
  render()
  act(() => { api!.startOrJoin(TOGETHER_KEY, ['andreas'], 30) })
  act(() => { vi.advanceTimersByTime(31_000) })
  expect(laneFor(TOGETHER_KEY)!.done).toBe(true)

  act(() => { api!.startOrJoin(TOGETHER_KEY, ['andreas', 'partner'], 90) })
  expect(laneFor(TOGETHER_KEY)!.remaining).toBe(90)
})

test('lanes survive a reload with the right time left', () => {
  render()
  act(() => { api!.start('andreas', ['andreas'], 120) })
  act(() => { api!.start('partner', ['partner'], 60) })
  act(() => { vi.advanceTimersByTime(20_000) })
  expect(localStorage.getItem(REST_LANES_KEY)).not.toBeNull()

  // Reload: a fresh mount reading the same storage.
  act(() => { root!.unmount() })
  render()

  expect(laneFor('andreas')!.remaining).toBe(100)
  expect(laneFor('partner')!.remaining).toBe(40)
})

test('a lane at zero keeps showing GO until it is cleared', () => {
  render()
  act(() => { api!.start('andreas', ['andreas'], 10) })
  act(() => { vi.advanceTimersByTime(60_000) })
  expect(laneFor('andreas')!.done).toBe(true)
  expect(laneFor('andreas')!.remaining).toBe(0)
  expect(laneFor('andreas')!.progress).toBe(1)
})

test('±15s shifts the remaining time only; pause freezes the deadline', () => {
  render()
  act(() => { api!.start('andreas', ['andreas'], 90) })
  act(() => { vi.advanceTimersByTime(10_000) })
  expect(laneFor('andreas')!.remaining).toBe(80)

  act(() => { api!.adjust('andreas', 15) })
  expect(laneFor('andreas')!.remaining).toBe(95)
  expect(laneFor('andreas')!.total).toBe(90)

  act(() => { api!.togglePause('andreas') })
  act(() => { vi.advanceTimersByTime(30_000) })
  expect(laneFor('andreas')!.remaining).toBe(95)
  expect(laneFor('andreas')!.paused).toBe(true)

  act(() => { api!.togglePause('andreas') })
  act(() => { vi.advanceTimersByTime(5_000) })
  expect(laneFor('andreas')!.remaining).toBe(90)
})

test('clearAll empties the dock and its storage', () => {
  render()
  act(() => { api!.start('andreas', ['andreas'], 90) })
  act(() => { api!.clearAll() })
  expect(api!.lanes).toEqual([])
  expect(localStorage.getItem(REST_LANES_KEY)).toBeNull()
})
