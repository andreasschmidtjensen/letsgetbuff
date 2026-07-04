import { useState, useEffect } from 'react'

// Admin-only Anthropic API key card (Phase 18).
export default function ApiKeyCard() {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/config/ai-key', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: { configured: boolean }) => setConfigured(d.configured))
      .catch(() => setConfigured(false))
  }, [])

  const save = async () => {
    if (!keyInput.trim()) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/config/ai-key', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: keyInput.trim() }),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(b.error ?? `HTTP ${res.status}`)
      }
      setConfigured(true)
      setKeyInput('')
      setMsg('✓ API key saved')
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
      const res = await fetch('/api/admin/config/ai-key', { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = (await res.json()) as { configured: boolean }
      setConfigured(d.configured)
      setMsg(d.configured ? '✓ DB key removed (env var still active)' : '✓ API key removed')
    } catch (err) {
      setMsg(`✗ ${String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card mb-12">
      <div className="card-title">🔑 Claude API key (admin)</div>
      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 13 }}>Status: </span>
        <span style={{ fontSize: 13, color: configured ? 'var(--green)' : 'var(--text-muted)', fontWeight: 500 }}>
          {configured === null ? 'Checking…' : configured ? 'Configured' : 'Not configured'}
        </span>
      </div>
      <input
        type="password"
        className="input mb-8"
        placeholder="sk-ant-…"
        autoComplete="off"
        value={keyInput}
        onChange={e => setKeyInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save() }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          disabled={busy || !keyInput.trim()}
          onClick={save}
        >
          Save key
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
