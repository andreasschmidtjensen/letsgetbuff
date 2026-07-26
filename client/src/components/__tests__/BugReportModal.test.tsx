/**
 * BugReportModal — 🐛 header popup: status fetch → form → POST /api/github/issue.
 *
 * react-dom + act under jsdom with a stubbed global fetch (no @testing-library),
 * matching CountdownTimer.test.tsx.
 *
 * Covers:
 *  1. Not connected → prompt + Go to Settings button wired to onGoToSettings
 *  2. Connected → submit posts the right JSON and renders the issue link
 *  3. Server error → red error text; Escape key closes via onClose
 */

import { test, expect, beforeAll, afterEach, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import BugReportModal from '../BugReportModal'

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

async function render(el: React.ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  // async act so the mount-time status fetch resolves before assertions
  await act(async () => { root!.render(el) })
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

function stubFetch(status: { configured: boolean; connected: boolean }, issueResponse?: {
  ok: boolean; status: number; body: Record<string, unknown>
}) {
  const fetchMock = vi.fn((url: string) => {
    if (url === '/api/github/status') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ...status, githubLogin: null }) })
    }
    if (url === '/api/github/issue' && issueResponse) {
      return Promise.resolve({
        ok: issueResponse.ok,
        status: issueResponse.status,
        json: () => Promise.resolve(issueResponse.body),
      })
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function findButton(text: string): HTMLButtonElement {
  const btn = [...container!.querySelectorAll('button')].find(b => b.textContent!.includes(text))
  if (!btn) throw new Error(`button "${text}" not found`)
  return btn
}

test('not connected → prompt with a working Go to Settings button', async () => {
  stubFetch({ configured: true, connected: false })
  const onGoToSettings = vi.fn()
  await render(<BugReportModal onClose={() => {}} onGoToSettings={onGoToSettings} />)

  expect(container!.textContent).toContain('Connect your GitHub account first')
  expect(container!.querySelector('input')).toBeNull()
  act(() => { findButton('Go to Settings').click() })
  expect(onGoToSettings).toHaveBeenCalledTimes(1)
})

test('connected → submit posts JSON and renders the issue link', async () => {
  const fetchMock = stubFetch({ configured: true, connected: true }, {
    ok: true, status: 201,
    body: { ok: true, url: 'https://github.com/andreasschmidtjensen/letsgetbuff/issues/7', number: 7 },
  })
  await render(<BugReportModal onClose={() => {}} onGoToSettings={() => {}} />)

  setValue(container!.querySelector('input')!, 'Timer bug')
  setValue(container!.querySelector('textarea')!, 'It keeps running.')
  await act(async () => { findButton('Report bug').click() })

  expect(fetchMock).toHaveBeenCalledWith('/api/github/issue', expect.objectContaining({
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({ title: 'Timer bug', description: 'It keeps running.' }),
  }))
  const link = container!.querySelector('a')!
  expect(link.getAttribute('href')).toBe('https://github.com/andreasschmidtjensen/letsgetbuff/issues/7')
  expect(link.textContent).toContain('Issue #7')
  // Form cleared after success; close button flips to Done
  expect((container!.querySelector('input') as HTMLInputElement).value).toBe('')
  expect(findButton('Done')).toBeTruthy()
})

test('server error → red error text; Escape closes the modal', async () => {
  stubFetch({ configured: true, connected: true }, {
    ok: false, status: 502,
    body: { error: 'GitHub issue creation failed: 502' },
  })
  const onClose = vi.fn()
  await render(<BugReportModal onClose={onClose} onGoToSettings={() => {}} />)

  setValue(container!.querySelector('input')!, 'Timer bug')
  await act(async () => { findButton('Report bug').click() })
  expect(container!.textContent).toContain('GitHub issue creation failed')

  act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
  expect(onClose).toHaveBeenCalledTimes(1)
})
