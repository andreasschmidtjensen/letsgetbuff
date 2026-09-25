import { test, expect, Page } from '@playwright/test'

/**
 * Cross-browser smoke + the compatibility classes unit tests can't reach:
 * touch input, and the audio/wake-lock code paths that broke on iPhone (v53).
 *
 * Audio is asserted by PATH, not audibility: an init script records every
 * HTMLMediaElement.play(), AudioContext.resume() and wakeLock.request() so
 * tests can check the right route ran in the right engine.
 */

declare global {
  interface Window {
    __played: string[]
    __ctxStates: () => string[]
    __wakeLocks: number
  }
}

// Recorders must be installed before any app script runs.
async function installRecorders(page: Page) {
  await page.addInitScript(() => {
    window.__played = []
    window.__resumes = 0
    window.__wakeLocks = 0
    const origPlay = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      if (!this.muted) window.__played.push((this.currentSrc || this.src || '').slice(0, 40))
      const p = origPlay.call(this)
      return p && typeof p.catch === 'function' ? p.catch(() => undefined) as Promise<void> : p
    }
    // Track every AudioContext so tests can assert it ends up 'running'
    // (a suspended context silently loses all scheduled audio on iOS).
    const AC = window.AudioContext
    if (AC) {
      const instances: AudioContext[] = []
      window.AudioContext = class extends AC {
        constructor(...args: ConstructorParameters<typeof AudioContext>) {
          super(...args)
          instances.push(this)
        }
      }
      window.__ctxStates = () => instances.map(c => c.state)
    } else {
      window.__ctxStates = () => []
    }
    // Record wake-lock requests; provide a stub where the API is missing so
    // the assertion is meaningful in every engine.
    try {
      const wl = navigator.wakeLock
      const impl = wl
        ? wl.request.bind(wl)
        : async () => ({ release: async () => undefined, addEventListener: () => undefined })
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: { request: (t: 'screen') => { window.__wakeLocks++; return impl(t) } },
      })
    } catch { /* engines that refuse redefinition simply skip that assertion */ }
  })
}

async function continueAsGuest(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /guest/i }).click()
  await expect(page.locator('.app-nav')).toBeVisible()
}

test.beforeEach(async ({ page }) => { await installRecorders(page) })

test('boots, logs in with CWA credentials, onboards, and shows the workout view', async ({ page }) => {
  await page.goto('/')
  await page.locator('input:not([type=password])').first().fill('e2e')
  await page.locator('input[type=password]').fill('testpassword123')
  await page.getByRole('button', { name: /log in|sign in/i }).first().click()
  await expect(page.locator('.app-nav')).toBeVisible()
  // Fresh account: set the plan start date (also exercises a real state write).
  const startInput = page.locator('input[type=date]').first()
  if (await startInput.isVisible().catch(() => false)) {
    await startInput.fill('2026-09-01')
    await page.getByRole('button', { name: /Start program/i }).click()
  }
  await page.locator('.nav-btn', { hasText: 'Workout' }).click()
  await expect(page.getByText(/Workout [AB]/).first()).toBeVisible()
})

test('guest mode renders every tab and never writes', async ({ page }) => {
  const writes: string[] = []
  page.on('request', r => {
    if (r.url().includes('/api/') && r.method() !== 'GET') writes.push(`${r.method()} ${new URL(r.url()).pathname}`)
  })
  await continueAsGuest(page)
  for (const tab of ['Workout', 'Stretch', 'At home', 'Guide', 'Settings']) {
    await page.locator('.nav-btn', { hasText: tab }).click()
    await expect(page.locator('.view-container, .app-main').first()).toBeVisible()
  }
  expect(writes).toEqual([])
})

test('touch: tab bar and a workout card respond to taps', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('iphone'), 'touch profile only')
  await continueAsGuest(page)
  await page.locator('.nav-btn', { hasText: 'Stretch' }).tap()
  await expect(page.getByRole('button', { name: /Start stretch focus/i })).toBeVisible()
  // Tap the first why-chip: the explain panel must open from a touch event.
  await page.locator('.explain-btn').first().tap()
  await expect(page.locator('.explain-panel').first()).toBeVisible()
})

test('iOS route: the sound preview plays through an <audio> element (ringer-switch-proof)', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('iphone'), 'iOS-specific audio routing')
  await continueAsGuest(page)
  await page.locator('.nav-btn', { hasText: 'Settings' }).tap()
  // Tapping a sound previews it immediately; on iOS that must be an element
  // play (data:audio/wav for the beep), never bare Web Audio.
  await page.getByRole('button', { name: 'Beep' }).tap()
  await expect.poll(() => page.evaluate(() => window.__played)).toContainEqual(expect.stringContaining('data:audio/wav'))
})

test('timer end fires the element route after the countdown (fake clock)', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('iphone'), 'iOS-specific audio routing')
  await continueAsGuest(page)
  await page.clock.install()
  await page.locator('.nav-btn', { hasText: 'Stretch' }).tap()
  // Start the first hold/flow timer directly from the card.
  await page.getByRole('button', { name: /Start .* timer/i }).first().tap()
  const before = await page.evaluate(() => window.__played.length)
  await page.clock.fastForward('01:30') // longest level-1 dose is 50s
  await expect.poll(() => page.evaluate(() => window.__played.length), { timeout: 10_000 }).toBeGreaterThan(before)
})

test('a session keeps the screen awake (wake lock requested)', async ({ page }) => {
  await continueAsGuest(page)
  await page.locator('.nav-btn', { hasText: 'Stretch' }).click()
  await page.getByRole('button', { name: /Start stretch focus/i }).click()
  await expect(page.locator('.v2-focus')).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__wakeLocks)).toBeGreaterThan(0)
})

test('gesture unlock: starting a session leaves the AudioContext running', async ({ page }) => {
  await continueAsGuest(page)
  // Playwright's WebKit builds ship without Web Audio entirely — there the
  // element-route tests above are the meaningful coverage.
  test.skip(await page.evaluate(() => typeof window.AudioContext === 'undefined'), 'engine has no Web Audio')
  await page.locator('.nav-btn', { hasText: 'At home' }).click()
  await page.getByRole('button', { name: /Start home workout/i }).click()
  await expect(page.locator('.v2-focus')).toBeVisible()
  // unlockAudio() must have resumed whatever state the engine created it in.
  await expect.poll(() => page.evaluate(() => window.__ctxStates())).toEqual(
    expect.arrayContaining(['running']),
  )
})
