import { useEffect, useRef, useState } from 'react'

// Server response of GET /api/github/status — owned by SettingsView so the
// connect card and the bug-report card stay in sync.
export interface GithubStatus {
  configured: boolean
  connected: boolean
  githubLogin: string | null
}

interface FlowInfo {
  userCode: string
  verificationUri: string
  deviceCode: string
  interval: number
}

interface Props {
  status: GithubStatus | null
  onChange: (status: GithubStatus) => void
}

// GitHub account connection via OAuth device flow: show a short code, the user
// approves it at github.com/login/device, we poll the server until granted.
export default function GithubConnectCard({ status, onChange }: Props) {
  const [flow, setFlow] = useState<FlowInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)

  // Poll with a setTimeout chain (not setInterval) so a slow_down response can
  // stretch the delay. Transient network errors keep the loop alive.
  useEffect(() => {
    if (!flow) return
    let stopped = false
    let interval = flow.interval || 5
    const poll = async () => {
      try {
        const res = await fetch('/api/github/device/poll', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ deviceCode: flow.deviceCode }),
        })
        const d = (await res.json()) as {
          status?: string; githubLogin?: string | null; interval?: number; error?: string
        }
        if (stopped) return
        if (res.ok) {
          if (d.status === 'connected') {
            setFlow(null)
            setMsg('✓ GitHub connected')
            onChange({ configured: true, connected: true, githubLogin: d.githubLogin ?? null })
            return
          }
          if (d.status === 'expired') { setFlow(null); setMsg('✗ Code expired — try again'); return }
          if (d.status === 'denied') { setFlow(null); setMsg('✗ Authorization was denied'); return }
          if (d.status === 'slow_down') interval = d.interval || interval + 5
          // 'pending' → just poll again
        }
      } catch { /* transient network error — keep polling */ }
      if (!stopped) timerRef.current = window.setTimeout(poll, interval * 1000)
    }
    timerRef.current = window.setTimeout(poll, interval * 1000)
    return () => {
      stopped = true
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [flow, onChange])

  const start = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/github/device/start', { method: 'POST', credentials: 'include' })
      const d = (await res.json().catch(() => ({}))) as {
        userCode?: string; verificationUri?: string; deviceCode?: string; interval?: number; error?: string
      }
      if (!res.ok || !d.userCode || !d.deviceCode) throw new Error(d.error ?? `HTTP ${res.status}`)
      setFlow({
        userCode: d.userCode,
        verificationUri: d.verificationUri ?? 'https://github.com/login/device',
        deviceCode: d.deviceCode,
        interval: d.interval || 5,
      })
    } catch (err) {
      setMsg(`✗ ${String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/github/token', { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      onChange({ configured: status?.configured ?? true, connected: false, githubLogin: null })
      setMsg('✓ Disconnected')
    } catch (err) {
      setMsg(`✗ ${String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card mb-12">
      <div className="card-title">🐙 GitHub account</div>
      {status === null ? (
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>Checking…</p>
      ) : !status.configured ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
          GitHub bug reporting is not set up yet. An admin can add the client ID in Settings.
        </p>
      ) : status.connected ? (
        <div>
          <p style={{ fontSize: 13, marginBottom: 10 }}>
            <span style={{ color: 'var(--green)', fontWeight: 500 }}>
              ✓ Connected{status.githubLogin ? ` as @${status.githubLogin}` : ''}
            </span>
          </p>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={disconnect}>
            Disconnect
          </button>
        </div>
      ) : flow ? (
        <div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
            Enter this code at{' '}
            <a href={flow.verificationUri} target="_blank" rel="noreferrer">
              {flow.verificationUri.replace('https://', '')}
            </a>
            :
          </p>
          <div style={{
            fontFamily: 'monospace',
            fontSize: 24,
            letterSpacing: 4,
            fontWeight: 600,
            marginBottom: 8,
            userSelect: 'all',
          }}>
            {flow.userCode}
          </div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Waiting for authorization…</p>
          <button className="btn btn-secondary btn-sm" onClick={() => setFlow(null)}>
            Cancel
          </button>
        </div>
      ) : (
        <div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
            Connect your GitHub account to report bugs directly from the app.
            Issues are filed under your own GitHub name.
          </p>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={start}>
            Connect GitHub
          </button>
        </div>
      )}
      {msg && (
        <p style={{ fontSize: 13, marginTop: 8, color: msg.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>
          {msg}
        </p>
      )}
    </div>
  )
}
