/**
 * Phase 20 item 9 — shared countdown engine tests.
 *
 * Locks the behaviour of useCountdown (extracted from the three former inline
 * timers) so the dedup can't silently change it: ticks down once per second,
 * fires onComplete exactly once at zero with the full total, ±adjust (with and
 * without growing the total), and start() picking up a changed `seconds` prop.
 *
 * react-dom + act + fake timers under jsdom (no @testing-library dependency).
 */

import { test, expect, beforeAll, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { useCountdown, type Countdown } from '../CountdownTimer'

beforeAll(() => {
  const g = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  g.IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => { vi.useFakeTimers() })

let container: HTMLElement | null = null
let root: Root | null = null

afterEach(() => {
  act(() => { root?.unmount() })
  container?.remove()
  container = null
  root = null
  vi.useRealTimers()
})

// Harness that surfaces the hook's controls to the test (no einkMode context needed).
let ctl: Countdown
function Harness(props: { seconds: number; autoStart?: boolean; adjustAffectsTotal?: boolean; onComplete?: (n: number) => void }) {
  ctl = useCountdown({
    seconds: props.seconds,
    autoStart: props.autoStart,
    adjustAffectsTotal: props.adjustAffectsTotal,
    audioCtx: null,
    muted: true,
    onComplete: props.onComplete,
  })
  return <span data-testid="rem">{ctl.remaining}</span>
}

function render(el: React.ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => { root!.render(el) })
}

function tick(seconds: number) {
  act(() => { vi.advanceTimersByTime(seconds * 1000) })
}

test('auto-started countdown ticks to zero and fires onComplete once with the total', () => {
  const onComplete = vi.fn()
  render(<Harness seconds={3} autoStart onComplete={onComplete} />)
  expect(ctl.remaining).toBe(3)
  expect(ctl.running).toBe(true)

  tick(3)
  expect(ctl.remaining).toBe(0)
  expect(ctl.running).toBe(false)
  expect(onComplete).toHaveBeenCalledTimes(1)
  expect(onComplete).toHaveBeenCalledWith(3)

  // No further firing after it has stopped.
  tick(5)
  expect(onComplete).toHaveBeenCalledTimes(1)
})

test('adjust without adjustAffectsTotal shifts remaining but not the total', () => {
  render(<Harness seconds={90} autoStart />)
  expect(ctl.total).toBe(90)
  act(() => ctl.adjust(15))
  expect(ctl.remaining).toBe(105)
  expect(ctl.total).toBe(90) // ring denominator stays fixed (Rest behaviour)
})

test('adjust with adjustAffectsTotal grows both total and remaining', () => {
  render(<Harness seconds={30} autoStart adjustAffectsTotal />)
  act(() => ctl.adjust(15))
  expect(ctl.remaining).toBe(45)
  expect(ctl.total).toBe(45) // ring re-scales (Exercise behaviour)
})

test('start() after a changed seconds prop counts the new duration (Stretch level change)', () => {
  const onComplete = vi.fn()
  render(<Harness seconds={20} onComplete={onComplete} />)
  expect(ctl.running).toBe(false) // no autoStart

  // Level change: parent re-renders with a new seconds value while stopped.
  render(<Harness seconds={45} onComplete={onComplete} />)
  act(() => ctl.start())
  expect(ctl.remaining).toBe(45)
  tick(45)
  expect(onComplete).toHaveBeenCalledWith(45)
})

test('countdown follows the wall clock across a background-tab gap (issue #2)', () => {
  const onComplete = vi.fn()
  render(<Harness seconds={60} autoStart onComplete={onComplete} />)
  tick(5)
  expect(ctl.remaining).toBe(55)

  // Background tab: the clock advances 30s but no interval callback fires.
  // The first throttled tick after returning must catch up to the wall clock.
  act(() => { vi.setSystemTime(Date.now() + 30_000) })
  tick(0.25)
  expect(ctl.remaining).toBe(25)

  // Jump past the deadline entirely; the visibilitychange resync completes it.
  act(() => {
    vi.setSystemTime(Date.now() + 120_000)
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(ctl.remaining).toBe(0)
  expect(ctl.running).toBe(false)
  expect(onComplete).toHaveBeenCalledTimes(1)
  expect(onComplete).toHaveBeenCalledWith(60)
})

test('achieved() reports elapsed seconds for an early finish', () => {
  render(<Harness seconds={60} autoStart adjustAffectsTotal />)
  tick(10)
  expect(ctl.remaining).toBe(50)
  expect(ctl.achieved()).toBe(10)
  act(() => ctl.stop())
  expect(ctl.running).toBe(false)
})
