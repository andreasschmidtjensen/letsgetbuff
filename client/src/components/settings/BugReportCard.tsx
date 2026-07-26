import { useState } from 'react'

interface Props {
  // null = status still loading
  connected: boolean | null
  // Called when the server reports the GitHub token was revoked (401 reconnect)
  onDisconnected?: () => void
}

// Bug-report form → POST /api/github/issue → link to the created issue.
export default function BugReportCard({ connected, onDisconnected }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ url: string; number: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!title.trim()) return
    setBusy(true)
    setError(null)
    setResult(null)
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
        if (d.reconnect) onDisconnected?.()
        throw new Error(d.error ?? `HTTP ${res.status}`)
      }
      setResult({ url: d.url ?? '', number: d.number ?? 0 })
      setTitle('')
      setDescription('')
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card mb-12">
      <div className="card-title">🐛 Report a bug</div>
      {connected === null ? (
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>Checking…</p>
      ) : !connected ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
          Connect your GitHub account above to report bugs.
        </p>
      ) : (
        <div>
          <input
            className="input mb-8"
            placeholder="Short title, e.g. “Rest timer keeps running after workout ends”"
            value={title}
            maxLength={256}
            onChange={e => setTitle(e.target.value)}
          />
          <textarea
            className="input"
            style={{ width: '100%', minHeight: 72, marginBottom: 8, resize: 'vertical', fontSize: 13 }}
            placeholder="What happened? What did you expect? Steps to reproduce help a lot."
            value={description}
            maxLength={10000}
            onChange={e => setDescription(e.target.value)}
          />
          <button
            className="btn btn-primary btn-sm"
            disabled={busy || !title.trim()}
            onClick={submit}
          >
            {busy ? 'Reporting…' : 'Report bug'}
          </button>
          {result && (
            <p style={{ color: 'var(--green)', fontSize: 13, marginTop: 8 }}>
              ✓ <a href={result.url} target="_blank" rel="noreferrer">Issue #{result.number}</a> created
            </p>
          )}
          {error && (
            <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }}>✗ {error}</p>
          )}
        </div>
      )}
    </div>
  )
}
