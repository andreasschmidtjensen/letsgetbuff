import { Component, ErrorInfo, ReactNode } from 'react'
import { UI_V2_KEY } from '../store/uiVersion'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// Top-level safety net. Before this existed, any render-time throw (classically
// an AppState field that hadn't been migrated) blanked the whole app with no
// feedback. The boundary catches it and shows an actionable screen with a
// reload button instead of a white void. Must be a class component — React
// only exposes error catching via getDerivedStateFromError / componentDidCatch.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface it for anyone with the console open (and for future error reporting).
    console.error('[letsgetbuff] Uncaught render error:', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    // The boundary sits above every provider, so it reads the flag straight from
    // localStorage. If the beta screens are what crashed, a reload alone would
    // land right back in them — offer the way out.
    let onV2 = false
    try { onV2 = localStorage.getItem(UI_V2_KEY) === '1' } catch { /* storage blocked */ }

    return (
      <div
        role="alert"
        style={{
          minHeight: '100dvh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
          padding: 24, textAlign: 'center',
          background: 'var(--bg)', color: 'var(--text)',
        }}
      >
        <h1 style={{ fontSize: 20, margin: 0 }}>Something went wrong</h1>
        <p style={{ maxWidth: 420, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
          The app hit an unexpected error and couldn't continue. Reloading usually fixes it.
          If it keeps happening, your data is still safe on the server — try again later.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '12px 24px', fontSize: 16, fontWeight: 600, cursor: 'pointer',
            border: 'none', borderRadius: 8,
            background: 'var(--accent, #e0a800)', color: 'var(--bg, #0f0f0f)',
          }}
        >
          Reload the app
        </button>
        {onV2 && (
          <button
            onClick={() => {
              try { localStorage.setItem(UI_V2_KEY, '0') } catch { /* storage blocked */ }
              window.location.reload()
            }}
            style={{
              padding: '12px 24px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
              borderRadius: 8, background: 'transparent', color: 'var(--text, #e0e0e0)',
              border: '1px solid var(--border, #333)',
            }}
          >
            Switch back to the classic workout screen
          </button>
        )}
        <pre
          style={{
            maxWidth: '90vw', overflowX: 'auto', fontSize: 12,
            color: 'var(--text-muted)', opacity: 0.8, marginTop: 8,
          }}
        >
          {error.message}
        </pre>
      </div>
    )
  }
}
