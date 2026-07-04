/**
 * Phase 20 item 3 — top-level ErrorBoundary test.
 *
 * Uses react-dom + act directly (no @testing-library dependency) under the
 * existing jsdom vitest environment. Covers: renders children normally, and
 * when a child throws it shows the actionable fallback (alert role + reload
 * button + the error message) instead of a blank screen.
 */

import { test, expect, beforeAll, afterEach, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import ErrorBoundary from '../ErrorBoundary'

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
  vi.restoreAllMocks()
})

function render(el: React.ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => { root!.render(el) })
}

function Boom(): React.ReactElement {
  throw new Error('kaboom from a child')
}

test('renders children when nothing throws', () => {
  render(<ErrorBoundary><p>all good</p></ErrorBoundary>)
  expect(container!.textContent).toContain('all good')
  expect(container!.querySelector('[role="alert"]')).toBeNull()
})

test('shows the actionable fallback with a reload button when a child throws', () => {
  // React logs the caught error to console.error — silence it for a clean run.
  vi.spyOn(console, 'error').mockImplementation(() => {})
  render(<ErrorBoundary><Boom /></ErrorBoundary>)

  const alert = container!.querySelector('[role="alert"]')
  expect(alert).not.toBeNull()
  expect(container!.textContent).toContain('Something went wrong')
  expect(container!.textContent).toContain('kaboom from a child')

  const btn = container!.querySelector('button')!
  expect(btn.textContent).toContain('Reload the app')
})
