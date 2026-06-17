/**
 * E-ink mode — a per-user, frontend-only display preference for e-paper screens.
 * When on, applies the monochrome, animation-free `data-theme="eink"` and exposes
 * the flag so a few components can render simplified, e-ink-friendly layouts.
 *
 * Stored per browser in localStorage; never touches the server.
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { applyTheme, getEink, setEink, savedTheme } from '../lib/theme'

interface EinkModeCtx {
  einkMode: boolean
  setEinkMode: (on: boolean) => void
}

const Ctx = createContext<EinkModeCtx | null>(null)

export function EinkModeProvider({ children }: { children: ReactNode }) {
  const [einkMode, setEinkModeState] = useState<boolean>(() => getEink())

  const setEinkMode = useCallback((on: boolean) => {
    setEinkModeState(on)
    setEink(on)
    applyTheme(on ? 'eink' : savedTheme())
  }, [])

  return <Ctx.Provider value={{ einkMode, setEinkMode }}>{children}</Ctx.Provider>
}

export function useEinkMode(): EinkModeCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useEinkMode must be inside EinkModeProvider')
  return ctx
}
