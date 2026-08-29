/**
 * The v2 UI flag. It is a device preference, not data: it must round-trip in
 * localStorage, let a `?ui=` URL parameter override (and stick, so a broken
 * toggle can't trap you), and never reach the server — including in guest mode,
 * where nothing at all may be written to the app-state paths.
 */

import { test, expect, beforeEach, afterEach, vi } from 'vitest'
import { getUiV2, setUiV2, UI_V2_KEY } from '../uiVersion'

function setSearch(search: string) {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, search },
    writable: true,
  })
}

beforeEach(() => {
  localStorage.clear()
  setSearch('')
})

afterEach(() => { vi.unstubAllGlobals() })

test('defaults to off', () => {
  expect(getUiV2()).toBe(false)
})

test('round-trips through localStorage', () => {
  setUiV2(true)
  expect(localStorage.getItem(UI_V2_KEY)).toBe('1')
  expect(getUiV2()).toBe(true)

  setUiV2(false)
  expect(localStorage.getItem(UI_V2_KEY)).toBe('0')
  expect(getUiV2()).toBe(false)
})

test('?ui=v2 wins over a stored off and persists', () => {
  setUiV2(false)
  setSearch('?ui=v2')
  expect(getUiV2()).toBe(true)
  expect(localStorage.getItem(UI_V2_KEY)).toBe('1')
})

test('?ui=v1 wins over a stored on — the escape hatch', () => {
  setUiV2(true)
  setSearch('?ui=v1')
  expect(getUiV2()).toBe(false)
  expect(localStorage.getItem(UI_V2_KEY)).toBe('0')
})

test('an unrelated query parameter leaves the stored value alone', () => {
  setUiV2(true)
  setSearch('?foo=bar')
  expect(getUiV2()).toBe(true)
})

test('flipping the flag never talks to the server', () => {
  const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
  setUiV2(true)
  getUiV2()
  setUiV2(false)
  expect(fetchSpy).not.toHaveBeenCalled()
})
