/**
 * Phase 3 — Login gate.
 * Shown when GET /api/me returns 401. On success calls onLogin(username).
 */

import { useState, FormEvent } from 'react'
import type { Privilege } from '@letsgetbuff/shared'

interface Props {
  onLogin: (username: string, level: Privilege) => void
  /** Enter the sign-in-free demo (see store/guest.ts). */
  onGuest: () => void
}

export default function LoginView({ onLogin, onGuest }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (res.ok) {
        const data = await res.json()
        onLogin(data.username, (data.level as Privilege) ?? 'user')
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Login failed')
      }
    } catch {
      setError('Network error — is the server running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100dvh',
      background: 'var(--bg)',
      padding: '24px',
    }}>
      <h1 style={{ color: 'var(--accent)', marginBottom: '8px', fontSize: '1.6rem' }}>
        Let's Get Buff
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '32px', fontSize: '0.9rem' }}>
        Sign in with your Calibre-Web account
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          width: '100%',
          maxWidth: '320px',
        }}
      >
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          autoComplete="username"
          required
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          style={inputStyle}
        />

        {error && (
          <p style={{ color: 'var(--red)', fontSize: '0.85rem', margin: 0 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '12px',
            background: loading ? 'var(--accent-dim)' : 'var(--accent)',
            color: '#000',
            border: 'none',
            borderRadius: 'var(--radius)',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {/* Guest: full access to every training, nothing is saved */}
      <div style={{ width: '100%', maxWidth: '320px', marginTop: '20px', textAlign: 'center' }}>
        <button
          type="button"
          onClick={onGuest}
          style={{
            width: '100%',
            padding: '12px',
            background: 'transparent',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            fontWeight: 600,
            fontSize: '0.95rem',
            cursor: 'pointer',
          }}
        >
          Continue as guest
        </button>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '8px' }}>
          Browse and try every training. Nothing is saved.
        </p>
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '24px', textAlign: 'center' }}>
        Manage accounts in Calibre-Web Automated
      </p>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '11px 14px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text)',
  fontSize: '1rem',
  outline: 'none',
}
