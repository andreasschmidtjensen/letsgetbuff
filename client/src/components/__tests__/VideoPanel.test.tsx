/**
 * Phase 21 — VideoPanel: embedded video panel for gym exercise cards.
 * Single URL → embed thumbnail, no dots. Multiple URLs → dot nav switches the
 * embedded video. Unparseable URLs fall back to an external link per slot.
 */

import { test, expect, beforeAll, afterEach } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { VideoPanel } from '../workout/timers'

beforeAll(() => {
  const g = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  g.IS_REACT_ACT_ENVIRONMENT = true
})

let container: HTMLElement | null = null
let root: Root | null = null

afterEach(() => {
  act(() => { root?.unmount() })
  container?.remove()
  container = null
  root = null
})

function render(el: React.ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => { root!.render(el) })
}

test('single shorts URL renders a vertical embed thumbnail and no dots', () => {
  render(<VideoPanel urls={['https://www.youtube.com/shorts/Rkkc-FnURyc']} title="Dumbbell Lunge" />)
  const btn = container!.querySelector('button')!
  expect(btn.getAttribute('aria-label')).toBe('Play video: Dumbbell Lunge')
  expect(btn.style.aspectRatio).toBe('9 / 16')
  expect(container!.querySelector('.vc-dot')).toBeNull()
})

test('multiple URLs render dots; clicking a dot switches the embedded video', () => {
  render(<VideoPanel urls={[
    'https://www.youtube.com/shorts/aFtWSOruuhs',
    'https://www.youtube.com/shorts/H8jf3DwlIlo',
    'https://www.youtube.com/shorts/nveMA9ko3yk',
  ]} title="Single-Arm Row" />)
  const dots = container!.querySelectorAll('.vc-dot')
  expect(dots.length).toBe(3)
  expect(container!.querySelector('img')!.getAttribute('src')).toContain('aFtWSOruuhs')
  act(() => { (dots[1] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  expect(container!.querySelector('img')!.getAttribute('src')).toContain('H8jf3DwlIlo')
})

test('an unparseable URL slot falls back to an external link', () => {
  render(<VideoPanel urls={[
    'https://www.youtube.com/shorts/aFtWSOruuhs',
    'https://example.com/some-video',
  ]} title="Mixed" />)
  const dots = container!.querySelectorAll('.vc-dot')
  act(() => { (dots[1] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  const link = container!.querySelector('a.video-link')!
  expect(link.getAttribute('href')).toBe('https://example.com/some-video')
  expect(container!.querySelector('img')).toBeNull()
})
