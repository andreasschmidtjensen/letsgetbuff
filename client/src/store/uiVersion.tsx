/**
 * Workout UI version — a per-device, frontend-only switch between the classic
 * workout screens (v1) and the "focus mode v2" rest-dock redesign. Both write
 * the same AppState through the same reducer actions, so flipping it mid-session
 * loses nothing: it only re-renders.
 *
 * `?ui=v2` / `?ui=v1` in the URL forces (and persists) a version, so a broken
 * toggle can never trap you on a screen you can't get off. Stored per browser in
 * localStorage; never touches the server — a guest can flip it too, because it
 * is a display preference, not data.
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export const UI_V2_KEY = 'letsgetbuff-ui-v2'

/** Reads the flag, letting a `?ui=` query parameter win and stick. */
export function getUiV2(): boolean {
  try {
    const param = new URLSearchParams(window.location.search).get('ui')
    if (param === 'v2' || param === 'v1') {
      const on = param === 'v2'
      localStorage.setItem(UI_V2_KEY, on ? '1' : '0')
      return on
    }
  } catch {
    // A malformed URL must not keep the app from booting.
  }
  return localStorage.getItem(UI_V2_KEY) === '1'
}

export function setUiV2(on: boolean): void {
  localStorage.setItem(UI_V2_KEY, on ? '1' : '0')
}

interface UiVersionCtx {
  v2: boolean
  setV2: (on: boolean) => void
}

const Ctx = createContext<UiVersionCtx | null>(null)

export function UiVersionProvider({ children }: { children: ReactNode }) {
  const [v2, setV2State] = useState<boolean>(() => getUiV2())

  const setV2 = useCallback((on: boolean) => {
    setV2State(on)
    setUiV2(on)
  }, [])

  return <Ctx.Provider value={{ v2, setV2 }}>{children}</Ctx.Provider>
}

export function useUiVersion(): UiVersionCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useUiVersion must be inside UiVersionProvider')
  return ctx
}
