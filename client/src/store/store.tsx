import {
  createContext, useContext, useReducer, useEffect, useRef, useCallback, useState, ReactNode,
} from 'react'
import { AppState, EMPTY_STATE, setLivePlan } from '@letsgetbuff/shared'
import type { Plan } from '@letsgetbuff/shared'
import { reducer, Action } from './reducer'
import {
  loadLocalState, saveLocalState,
  fetchServerState, putServerState,
  isMigrated, markMigrated,
} from './persistence'

// Fetch the shared plan from the server and inject it into the catalog module.
// Falls back silently — the catalog's DEFAULT_PLAN remains active if this fails.
async function loadServerPlan(): Promise<void> {
  try {
    const res = await fetch('/api/plan')
    if (!res.ok) return
    const data = (await res.json()) as { plan: Plan }
    setLivePlan(data.plan)
  } catch {
    // offline or server down — DEFAULT_PLAN stays active
  }
}

// ── Sync status ───────────────────────────────────────────────────────────────

export type SyncStatus = 'loading' | 'synced' | 'syncing' | 'offline' | 'error'

interface StoreCtx {
  state: AppState
  dispatch: (action: Action) => void
  syncStatus: SyncStatus
  /** Number of local mutations not yet confirmed by the server (0 or 1). */
  pendingCount: number
}

const Ctx = createContext<StoreCtx | null>(null)

const SAVE_DEBOUNCE_MS = 1000   // slower debounce for network writes
const RETRY_INTERVAL_MS = 30000 // retry after 30s when offline/error

// ── Provider ──────────────────────────────────────────────────────────────────

interface StoreProviderProps {
  children: ReactNode
  username: string
}

export function StoreProvider({ children, username }: StoreProviderProps) {
  // Start from local cache for instant render; server state overwrites on mount
  const [state, dispatch] = useReducer(reducer, undefined, () => loadLocalState() ?? { ...EMPTY_STATE })
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading')
  const [pendingCount, setPendingCount] = useState(0)

  // Always-current references used inside async callbacks
  const latest = useRef(state)
  latest.current = state
  const pendingPut = useRef(false)       // is a PUT in-flight?
  const dirtyAfterLoad = useRef(false)   // did state change after server load?

  // ── 1. Load from server on mount ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function loadFromServer() {
      try {
        const { state: serverState } = await fetchServerState()

        if (cancelled) return

        const serverHasData =
          serverState.startDate !== null ||
          Object.keys(serverState.sessions).length > 0

        if (serverHasData) {
          // Server wins — load it and update local cache
          dispatch({ type: 'REPLACE_STATE', state: serverState })
          saveLocalState(serverState)
          setSyncStatus('synced')
        } else {
          // Server is empty for this user
          const localState = loadLocalState()
          if (localState && !isMigrated(username)) {
            // First-login migration: push local data up to the server
            setSyncStatus('syncing')
            try {
              await putServerState(localState)
              markMigrated(username)
              dispatch({ type: 'REPLACE_STATE', state: localState })
              setSyncStatus('synced')
            } catch (e) {
              console.error('[store] First-login migration PUT failed', e)
              dispatch({ type: 'REPLACE_STATE', state: localState })
              setSyncStatus('offline')
              setPendingCount(1)
            }
          } else {
            // No local data to migrate (or already done) — fresh start
            setSyncStatus('synced')
          }
        }
      } catch (e) {
        if (cancelled) return
        console.warn('[store] Server unreachable on mount — using local cache', e)
        // Keep whatever we loaded from localStorage already
        setSyncStatus('offline')
        setPendingCount(1) // assume local is ahead of server
      }
    }

    loadFromServer()
    // Load server plan in parallel — no need to block state restore on this
    loadServerPlan()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username])

  // ── 2. Write-through: debounced PUT on every state change ─────────────────
  useEffect(() => {
    // Don't write-back during initial load
    if (syncStatus === 'loading') return

    dirtyAfterLoad.current = true
    setPendingCount(1)

    // Always keep local cache fresh
    saveLocalState(state)

    const id = setTimeout(async () => {
      if (pendingPut.current) return  // another PUT already in flight
      pendingPut.current = true
      setSyncStatus('syncing')
      try {
        await putServerState(latest.current)
        pendingPut.current = false
        setPendingCount(0)
        setSyncStatus('synced')
      } catch (e) {
        pendingPut.current = false
        console.warn('[store] PUT /api/state failed', e)
        setSyncStatus(navigator.onLine ? 'error' : 'offline')
        // Keep pendingCount = 1 so the retry knows there's work
      }
    }, SAVE_DEBOUNCE_MS)

    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  // ── 3. Flush on reconnect / periodic retry ────────────────────────────────
  useEffect(() => {
    async function retry() {
      if (pendingCount === 0) return
      setSyncStatus('syncing')
      try {
        await putServerState(latest.current)
        setPendingCount(0)
        setSyncStatus('synced')
      } catch {
        setSyncStatus(navigator.onLine ? 'error' : 'offline')
      }
    }

    window.addEventListener('online', retry)
    const interval = setInterval(retry, RETRY_INTERVAL_MS)
    return () => {
      window.removeEventListener('online', retry)
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCount])

  // ── 4. Flush on tab close ─────────────────────────────────────────────────
  useEffect(() => {
    const flush = () => saveLocalState(latest.current)
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [])

  const stableDispatch = useCallback(dispatch, [dispatch])

  return (
    <Ctx.Provider value={{ state, dispatch: stableDispatch, syncStatus, pendingCount }}>
      {children}
    </Ctx.Provider>
  )
}

export function useStore(): StoreCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useStore must be inside StoreProvider')
  return ctx
}
