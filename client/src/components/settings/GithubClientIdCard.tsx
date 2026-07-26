import { useState, useEffect } from 'react'

interface Props {
  // Lets SettingsView flip the connect/report cards without a page reload.
  onConfiguredChange?: (configured: boolean) => void
}

// Admin-only GitHub OAuth App client-id card (bug reporting). Unlike the AI
// key, a client ID is public, so the stored value is shown for verification.
export default function GithubClientIdCard({ onConfiguredChange }: Props = {}) {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [idInput, setIdInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/config/github-client-id', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: { configured: boolean; clientId: string }) => {
        setConfigured(d.configured)
        setIdInput(d.clientId ?? '')
      })
      .catch(() => setConfigured(false))
  }, [])

  const save = async () => {
    if (!idInput.trim()) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/config/github-client-id', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: idInput.trim() }),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(b.error ?? `HTTP ${res.status}`)
      }
      setConfigured(true)
      setMsg('✓ Client ID saved')
      onConfiguredChange?.(true)
    } catch (err) {
      setMsg(`✗ ${String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/config/github-client-id', { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setConfigured(false)
      setIdInput('')
      setMsg('✓ Client ID removed')
      onConfiguredChange?.(false)
    } catch (err) {
      setMsg(`✗ ${String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card mb-12">
      <div className="card-title">🐙 GitHub client ID (admin)</div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
        Client ID of the GitHub OAuth App used for bug reporting (device flow must be
        enabled on the app). Needed before users can connect their accounts.
      </p>
      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 13 }}>Status: </span>
        <span style={{ fontSize: 13, color: configured ? 'var(--green)' : 'var(--text-muted)', fontWeight: 500 }}>
          {configured === null ? 'Checking…' : configured ? 'Configured' : 'Not configured'}
        </span>
      </div>
      <input
        type="text"
        className="input mb-8"
        placeholder="Ov23li…"
        autoComplete="off"
        value={idInput}
        onChange={e => setIdInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save() }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          disabled={busy || !idInput.trim()}
          onClick={save}
        >
          Save
        </button>
        {configured && (
          <button
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={remove}
          >
            Remove
          </button>
        )}
      </div>
      {msg && (
        <p style={{ fontSize: 13, marginTop: 8, color: msg.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>
          {msg}
        </p>
      )}
    </div>
  )
}
