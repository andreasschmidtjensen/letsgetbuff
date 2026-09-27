/**
 * Lets full-screen overlays (focus mode) open the app-level bug-report modal,
 * so a bug can be logged the moment it happens mid-workout. The value is null
 * for guests (bug reports are account-bound) and outside the app shell.
 */

import { createContext, useContext } from 'react'

export const BugReportContext = createContext<(() => void) | null>(null)

export function useOpenBugReport(): (() => void) | null {
  return useContext(BugReportContext)
}
