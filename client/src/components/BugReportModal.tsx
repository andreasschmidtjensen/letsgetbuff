/**
 * Bug-report popup — reachable from the 🐛 header button on every page.
 *
 * Fetches /api/github/status on open: connected users get the form (POST
 * /api/github/issue → link to the created issue), others get a pointer to the
 * Settings connect card. Inputs use 16px font so iOS doesn't auto-zoom.
 */

import { useEffect, useRef, useState } from 'react'

interface Props {
  onClose: () => void
  onGoToSettings: () => void
}

type Status = 'loading' | 'unconfigured' | 'disconnected' | 'connected'

export default function BugReportModal({ onClose, onGoToSettings }: Props) {
  const [status, setStatus] = useState<Status>('loading')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ url: string; number: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/github/status', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: { configured: boolean; connected: boolean }) => {
        setStatus(!d.configured ? 'unconfigured' : d.connected ? 'connected' : 'disconnected')
      })
      .catch(() => setStatus('unconfigured'))
  }, [])

  useEffect(() => {
    if (status === 'connected') titleRef.current?.focus()
  }, [status])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async () => {
    if (!title.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/github/issue', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: description.trim() }),
      })
      const d = (await res.json().catch(() => ({}))) as {
        url?: string; number?: number; error?: string; reconnect?: boolean
      }
      if (!res.ok) {
        if (d.reconnect) setStatus('disconnected')
        throw new Error(d.error ?? `HTTP ${res.status}`)
      }
      setResult({ url: d.url ?? '', number: d.number ?? 0 })
      setTitle('')
      setDescription('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Report a bug"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 20,
          maxWidth: 440,
          width: '100%',
          maxHeight: '90dvh',
          overflowY: 'auto',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 17, marginBottom: 10 }}>🐛 Report a bug</div>

        {status === 'loading' && (
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>Checking…</p>
        )}

        {status === 'unconfigured' && (
          <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
            GitHub bug reporting is not set up yet. An admin can add the client ID in Settings.
          </p>
        )}

        {status === 'disconnected' && (
          <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
            Connect your GitHub account first — it takes a minute and only has to be done once.
          </p>
        )}

        {status === 'connected' && (
          <div>
            <input
              ref={titleRef}
              className="input mb-8"
              style={{ fontSize: 16 }}
              placeholder="Short title"
              value={title}
              maxLength={256}
              onChange={e => setTitle(e.target.value)}
            />
            <textarea
              className="input"
              style={{ width: '100%', minHeight: 110, marginBottom: 8, resize: 'vertical', fontSize: 16 }}
              placeholder="What happened? What did you expect? Steps to reproduce help a lot."
              value={description}
              maxLength={10000}
              onChange={e => setDescription(e.target.value)}
            />
            {result && (
              <p style={{ color: 'var(--green)', fontSize: 14, margin: '0 0 8px' }}>
                ✓ <a href={result.url} target="_blank" rel="noreferrer">Issue #{result.number}</a> created
              </p>
            )}
            {error && (
              <p style={{ color: 'var(--red)', fontSize: 14, margin: '0 0 8px' }}>✗ {error}</p>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
          {status === 'connected' && (
            <button
              className="btn btn-primary"
              style={{ padding: '12px 18px', fontSize: 15, flex: 1 }}
              disabled={busy || !title.trim()}
              onClick={submit}
            >
              {busy ? 'Reporting…' : 'Report bug'}
            </button>
          )}
          {status === 'disconnected' && (
            <button
              className="btn btn-primary"
              style={{ padding: '12px 18px', fontSize: 15, flex: 1 }}
              onClick={onGoToSettings}
            >
              Go to Settings
            </button>
          )}
          <button
            className="btn btn-secondary"
            style={{ padding: '12px 18px', fontSize: 15, flex: 1 }}
            onClick={onClose}
          >
            {result ? 'Done' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}
