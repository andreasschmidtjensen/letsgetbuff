/**
 * Phase 19 — YouTubeEmbed component test.
 *
 * Uses react-dom + act directly (no @testing-library dependency) under the
 * existing jsdom vitest environment. Covers: renders a thumbnail play button
 * initially (no iframe), swaps in the youtube-nocookie iframe on tap, and
 * degrades to a written-cues note + plain link if the thumbnail fails to load.
 */

import { test, expect, beforeAll, afterEach } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import YouTubeEmbed from '../YouTubeEmbed'

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

test('initially renders a thumbnail play button, no iframe', () => {
  render(<YouTubeEmbed videoId="LHesB7TJW6c" title="Quad — Supported standing quad" />)
  const btn = container!.querySelector('button')
  expect(btn).not.toBeNull()
  expect(btn!.getAttribute('aria-label')).toBe('Play video: Quad — Supported standing quad')
  const img = container!.querySelector('img')
  expect(img!.getAttribute('src')).toBe('https://i.ytimg.com/vi/LHesB7TJW6c/hqdefault.jpg')
  expect(container!.querySelector('iframe')).toBeNull()
})

test('tapping the thumbnail loads the youtube-nocookie iframe', () => {
  render(<YouTubeEmbed videoId="LHesB7TJW6c" title="Quad demo" />)
  const btn = container!.querySelector('button')!
  act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  const iframe = container!.querySelector('iframe')
  expect(iframe).not.toBeNull()
  expect(iframe!.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/LHesB7TJW6c?autoplay=1&rel=0')
  expect(iframe!.getAttribute('title')).toBe('Quad demo')
})

test('a broken thumbnail degrades to a cues note + plain YouTube link', () => {
  render(<YouTubeEmbed videoId="LHesB7TJW6c" title="Quad demo" />)
  const img = container!.querySelector('img')!
  act(() => { img.dispatchEvent(new Event('error', { bubbles: true })) })
  expect(container!.querySelector('img')).toBeNull()
  expect(container!.querySelector('button')).toBeNull()
  const link = container!.querySelector('a')!
  expect(link.getAttribute('href')).toBe('https://www.youtube.com/watch?v=LHesB7TJW6c')
  expect(container!.textContent).toContain('follow the written cues')
})

test('vertical renders a 9:16 box with the portrait Shorts thumbnail', () => {
  render(<YouTubeEmbed videoId="Rkkc-FnURyc" title="Lunge demo" vertical />)
  const btn = container!.querySelector('button')!
  expect(btn.style.aspectRatio).toBe('9 / 16')
  const img = container!.querySelector('img')!
  expect(img.getAttribute('src')).toBe('https://i.ytimg.com/vi/Rkkc-FnURyc/oar2.jpg')
})

test('vertical thumbnail falls back oar2 → hqdefault → broken', () => {
  render(<YouTubeEmbed videoId="Rkkc-FnURyc" title="Lunge demo" vertical />)
  let img = container!.querySelector('img')!
  act(() => { img.dispatchEvent(new Event('error', { bubbles: true })) })
  img = container!.querySelector('img')!
  expect(img.getAttribute('src')).toBe('https://i.ytimg.com/vi/Rkkc-FnURyc/hqdefault.jpg')
  act(() => { img.dispatchEvent(new Event('error', { bubbles: true })) })
  expect(container!.querySelector('img')).toBeNull()
  expect(container!.textContent).toContain('follow the written cues')
})
