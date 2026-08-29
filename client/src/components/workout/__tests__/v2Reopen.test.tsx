/**
 * Regression: re-opening a completed timed rep must offer a way to re-time it.
 *
 * The classic logger drops a confirmed set into a bare number input — for a
 * timed exercise (Plank, Side Plank) that means the countdown is gone and the
 * only way to fix a mis-logged hold is to type the seconds by hand. v2's card
 * always shows the logged value plus a control that re-runs the timer.
 */

import { test, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import type { ExerciseDef, SetEntry } from '@letsgetbuff/shared'
import ExerciseCardV2 from '../v2/ExerciseCardV2'

vi.mock('../../../lib/sounds', () => ({
  playTimerEnd: vi.fn(), playDoneSound: vi.fn(), preloadTimerSounds: vi.fn(),
  getTimerSound: () => 'beep', setTimerSound: vi.fn(), TIMER_SOUNDS: [],
}))

beforeAll(() => {
  const g = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  g.IS_REACT_ACT_ENVIRONMENT = true
})

const TIMED: ExerciseDef = {
  id: 'plank-test',
  name: 'Plank',
  progressionType: 'timed',
  requiresKg: false,
  safetyCues: [],
  videoUrls: [],
  alternatives: [],
} as unknown as ExerciseDef

const PER_SIDE: ExerciseDef = { ...TIMED, id: 'side-plank-test', name: 'Side Plank', perSide: true }

let container: HTMLElement
let root: Root

function render(ui: React.ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => { root.render(ui) })
}

function buttons(): HTMLButtonElement[] {
  return [...container.querySelectorAll('button')] as HTMLButtonElement[]
}

function click(el: HTMLElement) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { act(() => { root.unmount() }); container.remove() })

test('a re-opened timed set shows its logged value and a way to re-time it', () => {
  const sets: SetEntry[] = [{ seconds: 42 }, {}, {}]
  render(
    <ExerciseCardV2
      exercise={TIMED}
      sets={sets}
      targetSets={3}
      targetSeconds={30}
      ownerLabel="Set"
      restMode="turns"
      shared={false}
      suggestion={null}
      onSave={() => {}}
      onSetComplete={() => {}}
      audioCtx={null}
      onAudioCtxInit={() => ({}) as AudioContext}
      muted
    />,
  )

  // The logged set is a chip; tapping it re-opens that set.
  const chip = buttons().find(b => b.textContent?.includes('42s'))
  expect(chip).toBeDefined()
  click(chip!)

  // The value is still on screen — never an empty state...
  expect(container.textContent).toContain('42s')
  // ...and the timer is available again, which is the bug this pins down.
  const redo = buttons().find(b => /Redo/.test(b.textContent ?? ''))
  expect(redo).toBeDefined()
})

test('an untouched timed set offers Start, not Redo', () => {
  render(
    <ExerciseCardV2
      exercise={TIMED}
      sets={[]}
      targetSets={3}
      targetSeconds={30}
      ownerLabel="Set"
      restMode="turns"
      shared={false}
      suggestion={null}
      onSave={() => {}}
      onSetComplete={() => {}}
      audioCtx={null}
      onAudioCtxInit={() => ({}) as AudioContext}
      muted
    />,
  )
  expect(buttons().some(b => /▶ Start/.test(b.textContent ?? ''))).toBe(true)
  expect(buttons().some(b => /Redo/.test(b.textContent ?? ''))).toBe(false)
})

test('a completed per-side set keeps a Redo on each half', () => {
  render(
    <ExerciseCardV2
      exercise={PER_SIDE}
      sets={[{ seconds: 30, right: { seconds: 27 } }]}
      targetSets={3}
      targetSeconds={30}
      ownerLabel="Set"
      restMode="together"
      shared={false}
      suggestion={null}
      onSave={() => {}}
      onSetComplete={() => {}}
      audioCtx={null}
      onAudioCtxInit={() => ({}) as AudioContext}
      muted
    />,
  )
  const chip = buttons().find(b => b.textContent?.includes('30s / 27s'))
  expect(chip).toBeDefined()
  click(chip!)
  expect(buttons().filter(b => /Redo/.test(b.textContent ?? '')).length).toBe(2)
})

test('a half-logged per-side set asks for the other side, not for rest', () => {
  render(
    <ExerciseCardV2
      exercise={PER_SIDE}
      sets={[{ seconds: 30 }]}
      targetSets={3}
      targetSeconds={30}
      ownerLabel="Set"
      restMode="together"
      shared={false}
      suggestion={null}
      onSave={() => {}}
      onSetComplete={() => {}}
      audioCtx={null}
      onAudioCtxInit={() => ({}) as AudioContext}
      muted
    />,
  )
  expect(container.textContent).toContain('SWITCH SIDES')
  expect(container.textContent).toContain('no rest until both sides are done')
  expect(buttons().some(b => /Start right/.test(b.textContent ?? ''))).toBe(true)
})
