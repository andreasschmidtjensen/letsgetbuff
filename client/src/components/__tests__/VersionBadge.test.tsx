/**
 * VersionBadge — build identity next to the 🐛 button.
 *
 * react-dom + act under jsdom with a stubbed global fetch (no @testing-library),
 * matching BugReportModal.test.tsx.
 *
 * The badge exists to make a stale cached client visible, so the assertions
 * centre on the sha comparison. Under vitest the baked-in sha is forced to
 * 'dev' (see the `define` in client/vite.config.ts), which is also the case
 * that must never falsely warn.
 *
 * Covers:
 *  1. Label combines the server version with this bundle's sha
 *  2. A 'dev' build never claims to be stale
 *  3. Offline /api/health still renders the sha
 *  4. Hover opens the notes popover: commit links + repo link, rel=noopener
 *  5. Mouse leave closes it
 */

import { test, expect, beforeAll, afterEach, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import VersionBadge from '../VersionBadge'

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

const REPO = 'https://github.com/andreasschmidtjensen/letsgetbuff'

const COMMITS = {
  repoUrl: REPO,
  commits: [
    {
      sha: 'a'.repeat(40), shortSha: 'aaaaaaa',
      subject: 'Advance the program week only on logged gym sessions',
      date: new Date().toISOString(), url: `${REPO}/commit/aaa`,
    },
    {
      sha: 'b'.repeat(40), shortSha: 'bbbbbbb',
      subject: 'Add a guest mode',
      date: new Date().toISOString(), url: `${REPO}/commit/bbb`,
    },
  ],
}

function stubFetch(health: Record<string, unknown> | null) {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/health') {
      if (health === null) return Promise.reject(new Error('offline'))
      return Promise.resolve({ ok: true, json: () => Promise.resolve(health) })
    }
    if (url === '/api/commits') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(COMMITS) })
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`))
  }))
}

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root!.render(<VersionBadge />) })
}

const badge = () => container!.querySelector('.version-badge') as HTMLButtonElement
const wrap = () => container!.querySelector('.version-badge-wrap') as HTMLElement

async function hover() {
  await act(async () => {
    wrap().dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    wrap().dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
  })
}

test('label combines the server version with this bundle sha', async () => {
  stubFetch({ ok: true, version: 42, sha: 'dev' })
  await render()
  expect(badge().textContent).toContain('v42')
  expect(badge().textContent).toContain('dev')
})

test('a dev build never claims to be stale', async () => {
  // Server reports a real sha; a local build has nothing meaningful to compare
  // against, so warning here would be noise on every dev run.
  stubFetch({ ok: true, version: 42, sha: '0'.repeat(40) })
  await render()
  expect(badge().textContent).not.toContain('⚠')
  expect(badge().className).not.toContain('version-badge-stale')
})

test('still renders the sha when /api/health is unreachable', async () => {
  stubFetch(null)
  await render()
  expect(badge().textContent).toContain('dev')
})

test('hover opens the notes popover with commit links and a repo link', async () => {
  stubFetch({ ok: true, version: 42, sha: 'dev' })
  await render()
  await hover()

  const popover = container!.querySelector('.version-popover')
  expect(popover).toBeTruthy()

  const links = [...popover!.querySelectorAll('.version-notes a')] as HTMLAnchorElement[]
  expect(links.map(a => a.textContent)).toEqual([
    'Advance the program week only on logged gym sessions',
    'Add a guest mode',
  ])
  expect(links[0].getAttribute('href')).toBe(`${REPO}/commit/aaa`)

  const repo = popover!.querySelector('.version-repo-link') as HTMLAnchorElement
  expect(repo.getAttribute('href')).toBe(REPO)
  // External links must not hand over window.opener.
  expect(repo.getAttribute('rel')).toContain('noopener')
})

test('mouse leave closes the popover, after the grace delay', async () => {
  vi.useFakeTimers()
  try {
    stubFetch({ ok: true, version: 42, sha: 'dev' })
    await render()
    await hover()
    expect(container!.querySelector('.version-popover')).toBeTruthy()

    await act(async () => {
      wrap().dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
      wrap().dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    })
    // Still open: the pointer needs time to cross the gap to the popover.
    expect(container!.querySelector('.version-popover')).toBeTruthy()

    await act(async () => { vi.advanceTimersByTime(300) })
    expect(container!.querySelector('.version-popover')).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})
