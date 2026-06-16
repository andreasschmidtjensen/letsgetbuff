/**
 * Test mode — a frontend-only sandbox. When on, you can run workouts, log sets and
 * use the timers freely, but nothing is persisted: the store skips all server PUTs
 * and localStorage writes, proxy writes are suppressed, and leaving test mode
 * discards any in-memory edits and restores your real data.
 *
 * The flag is per browser/user (localStorage) and never touches the server, so the
 * two users' test toggles are independent.
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

const TEST_MODE_KEY = 'letsgetbuff-test-mode'

interface TestModeCtx {
  testMode: boolean
  setTestMode: (on: boolean) => void
}

const Ctx = createContext<TestModeCtx | null>(null)

export function TestModeProvider({ children }: { children: ReactNode }) {
  const [testMode, setTestModeState] = useState<boolean>(() => localStorage.getItem(TEST_MODE_KEY) === '1')

  const setTestMode = useCallback((on: boolean) => {
    setTestModeState(on)
    localStorage.setItem(TEST_MODE_KEY, on ? '1' : '0')
  }, [])

  return <Ctx.Provider value={{ testMode, setTestMode }}>{children}</Ctx.Provider>
}

export function useTestMode(): TestModeCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTestMode must be inside TestModeProvider')
  return ctx
}
