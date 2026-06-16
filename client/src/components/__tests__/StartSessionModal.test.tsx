/**
 * Phase 13 (F2) — StartSessionModal component test.
 *
 * Uses react-dom + act directly (no @testing-library dependency) under the
 * existing jsdom vitest environment. Covers: renders both options with a partner,
 * calls onChoose correctly for each, and renders only "alone" when no partner.
 */

import { test, expect, beforeAll, afterEach, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import StartSessionModal from '../StartSessionModal'

beforeAll(() => {
  // React 18 requires this flag for act() outside a test framework integration.
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

function buttonsText(): string[] {
  return Array.from(container!.querySelectorAll('button')).map(b => b.textContent ?? '')
}

function clickButtonContaining(text: string) {
  const btn = Array.from(container!.querySelectorAll('button')).find(b => (b.textContent ?? '').includes(text))
  if (!btn) throw new Error(`No button containing "${text}". Have: ${buttonsText().join(' | ')}`)
  act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

test('renders both options when a partner is present', () => {
  render(<StartSessionModal partner={{ username: 'partner' }} onChoose={() => {}} />)
  const texts = buttonsText()
  expect(texts.some(t => t.includes('Train alone'))).toBe(true)
  expect(texts.some(t => t.includes('Train with partner'))).toBe(true)
})

test('renders only the alone option when there is no partner', () => {
  render(<StartSessionModal partner={null} onChoose={() => {}} />)
  const texts = buttonsText()
  expect(texts.some(t => t.includes('Train alone'))).toBe(true)
  expect(texts.some(t => t.includes('Train with'))).toBe(false)
})

test('calls onChoose("solo") when "Train alone" is clicked', () => {
  const onChoose = vi.fn()
  render(<StartSessionModal partner={{ username: 'partner' }} onChoose={onChoose} />)
  clickButtonContaining('Train alone')
  expect(onChoose).toHaveBeenCalledTimes(1)
  expect(onChoose).toHaveBeenCalledWith('solo')
})

test('calls onChoose("shared", partner) when "Train with" is clicked', () => {
  const onChoose = vi.fn()
  render(<StartSessionModal partner={{ username: 'partner' }} onChoose={onChoose} />)
  clickButtonContaining('Train with')
  expect(onChoose).toHaveBeenCalledTimes(1)
  expect(onChoose).toHaveBeenCalledWith('shared', 'partner')
})
