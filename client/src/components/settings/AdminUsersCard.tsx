import { useState, useEffect } from 'react'
import type { Privilege } from '@letsgetbuff/shared'

interface AdminUser {
  username: string
  level: Privilege
  createdAt: string
}

const LEVEL_OPTIONS: Privilege[] = ['none', 'viewer', 'user', 'admin']

// Admin-only user privilege card (Phase 11).
export default function AdminUsersCard() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [busyUser, setBusyUser] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/admin/users', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: { users: AdminUser[] }) => setUsers(d.users))
      .catch(() => { /* non-admins never render this card */ })
      .finally(() => setLoaded(true))
  }, [])

  const changeLevel = async (username: string, level: Privilege) => {
    const prev = users
    setBusyUser(username)
    setMsg(null)
    // Optimistic update
    setUsers(u => u.map(x => x.username === username ? { ...x, level } : x))
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(username)}/level`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ level }),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(b.error ?? `HTTP ${res.status}`)
      }
      setMsg(`✓ ${username} → ${level}`)
    } catch (err) {
      setUsers(prev) // rollback
      setMsg(`✗ ${String(err)}`)
    } finally {
      setBusyUser(null)
    }
  }

  if (!loaded || users.length === 0) return null

  return (
    <div className="card mb-12">
      <div className="card-title">👤 User access (admin)</div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
        Set what each Calibre-Web account may do here. Accounts themselves are managed in CWA.
      </p>
      {msg && (
        <p style={{ fontSize: 13, marginBottom: 8, color: msg.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>
          {msg}
        </p>
      )}
      {users.map(u => (
        <div key={u.username} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ flex: 1, fontSize: 14 }}>{u.username}</span>
          <select
            className="input"
            style={{ width: 120, fontSize: 13 }}
            value={u.level}
            disabled={busyUser === u.username}
            onChange={e => changeLevel(u.username, e.target.value as Privilege)}
            aria-label={`Privilege level for ${u.username}`}
          >
            {LEVEL_OPTIONS.map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}
