/**
 * BugReportCard — form → POST /api/github/issue → issue link.
 *
 * react-dom + act under jsdom with a stubbed global fetch (no @testing-library),
 * matching CountdownTimer.test.tsx.
 *
 * Covers:
 *  1. Not connected → prompt to connect, no form
 *  2. Connected → submit posts the right JSON and renders the issue link
 *  3. Server error → red error text; reconnect flag calls onDisconnected
 */

import { test, expect, beforeAll, afterEach, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import BugReportCard from '../settings/BugReportCard'

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
  vi.unstubAllGlobals()
})

function render(el: React.ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => { root!.render(el) })
}

function setValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  // React overrides the value setter — go through the prototype so the change
  // event isn't swallowed as a no-op.
  const proto = input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

test('not connected → prompt to connect, no form', () => {
  render(<BugReportCard connected={false} />)
  expect(container!.textContent).toContain('Connect your GitHub account above')
  expect(container!.querySelector('input')).toBeNull()
  expect(container!.querySelector('textarea')).toBeNull()
})

test('connected → submit posts JSON and renders the issue link', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 201,
    json: () => Promise.resolve({ ok: true, url: 'https://github.com/andreasschmidtjensen/letsgetbuff/issues/7', number: 7 }),
  })
  vi.stubGlobal('fetch', fetchMock)

  render(<BugReportCard connected={true} />)
  const input = container!.querySelector('input')!
  const textarea = container!.querySelector('textarea')!
  setValue(input, 'Timer bug')
  setValue(textarea, 'It keeps running.')

  const button = container!.querySelector('button')!
  await act(async () => { button.click() })

  expect(fetchMock).toHaveBeenCalledWith('/api/github/issue', expect.objectContaining({
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({ title: 'Timer bug', description: 'It keeps running.' }),
  }))
  const link = container!.querySelector('a')!
  expect(link.getAttribute('href')).toBe('https://github.com/andreasschmidtjensen/letsgetbuff/issues/7')
  expect(link.textContent).toContain('Issue #7')
  // Form cleared after success
  expect((container!.querySelector('input') as HTMLInputElement).value).toBe('')
})

test('server error → red error text; reconnect flag calls onDisconnected', async () => {
  const onDisconnected = vi.fn()
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: () => Promise.resolve({ error: 'GitHub authorization revoked — reconnect in Settings', reconnect: true }),
  })
  vi.stubGlobal('fetch', fetchMock)

  render(<BugReportCard connected={true} onDisconnected={onDisconnected} />)
  setValue(container!.querySelector('input')!, 'Timer bug')
  const button = container!.querySelector('button')!
  await act(async () => { button.click() })

  expect(container!.textContent).toContain('authorization revoked')
  expect(onDisconnected).toHaveBeenCalledTimes(1)
})
