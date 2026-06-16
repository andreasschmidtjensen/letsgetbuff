import { useRef, useState, useEffect } from 'react'
import { useStore, SyncStatus } from '../store/store'

// ── Theme helpers (exported for use in main.tsx) ──────────────────────────────
const THEME_KEY = 'letsgetbuff-theme'
const REST_SECS_KEY = 'letsgetbuff-rest-secs'
const REST_SECS_DEFAULT = 90
const REST_SECS_OPTIONS = [
  { value: 60,  label: '1 min' },
  { value: 90,  label: '90 sec' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
]

export function applyTheme(theme: 'dark' | 'light') {
  document.documentElement.setAttribute('data-theme', theme)
}

export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) as 'dark' | 'light' | null
  applyTheme(saved ?? 'dark')
}

import { exportData, validateImport, putServerState } from '../store/persistence'
import { todayKey } from '../lib/date'
import { SCHEMA_VERSION } from '@letsgetbuff/shared'
import type { ExerciseDef, Privilege } from '@letsgetbuff/shared'
import ConfirmDialog from '../components/ConfirmDialog'

interface Props {
  onLogout?: () => void
  level?: Privilege
}

// Small sync badge shown at top of settings
function SyncBadge({ status, pending }: { status: SyncStatus; pending: number }) {
  const label =
    status === 'loading'  ? '⏳ Loading…' :
    status === 'syncing'  ? '⏳ Syncing…' :
    status === 'synced'   ? '✓ Synced'    :
    status === 'offline'  ? `⚠ Offline${pending ? ` (${pending} unsaved)` : ''}` :
    /* error */              '✗ Sync error'

  const color =
    status === 'synced'  ? 'var(--green)'    :
    status === 'offline' ? 'var(--text-muted)' :
    status === 'error'   ? 'var(--red)'      :
    'var(--text-muted)'

  return (
    <span style={{ fontSize: 12, color, marginLeft: 8 }}>{label}</span>
  )
}

// ── Exercise Proposal types ────────────────────────────────────────────────────

interface Proposal {
  id: number
  workoutId: 'A' | 'B'
  request: string
  exercise: ExerciseDef
  status: 'pending' | 'approved' | 'rejected'
  proposedAt: string
  reviewedAt: string | null
}

// ── ExerciseProposalCard ───────────────────────────────────────────────────────

function ExerciseProposalCard({
  proposal,
  onApprove,
  onReject,
  busy,
}: {
  proposal: Proposal
  onApprove: (id: number) => void
  onReject: (id: number) => void
  busy: boolean
}) {
  const ex = proposal.exercise
  const statusColor =
    proposal.status === 'approved' ? 'var(--green)' :
    proposal.status === 'rejected' ? 'var(--text-muted)' :
    'var(--amber, #f59e0b)'

  return (
    <div
      className="card mb-8"
      style={{ borderLeft: `3px solid ${statusColor}`, opacity: proposal.status !== 'pending' ? 0.65 : 1 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{ex.name}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Workout {proposal.workoutId} · {ex.progressionType} ·{' '}
            {ex.reps === null ? `${ex.sets}×${ex.seconds}s` : `${ex.sets}×${ex.reps}`}
            {ex.perSide ? ' per side' : ''}
          </div>
        </div>
        <div className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
          {proposal.status === 'pending' ? 'Pending' : proposal.status === 'approved' ? '✓ Approved' : '✗ Rejected'}
        </div>
      </div>

      <p style={{ fontSize: 13, marginTop: 8, marginBottom: 6 }}>{ex.notes}</p>

      {ex.safetyCues.length > 0 && (
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
          ⚠ Safety: {ex.safetyCues.join(', ')}
        </div>
      )}

      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
        Alternatives: {ex.alternatives.join(', ')}
      </div>

      {ex.videoUrls.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {ex.videoUrls.map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, display: 'block', color: 'var(--primary)' }}
            >
              📹 Video {i + 1}
            </a>
          ))}
        </div>
      )}

      <div className="muted" style={{ fontSize: 11, marginBottom: 10 }}>
        Request: "{proposal.request}"
      </div>

      {proposal.status === 'pending' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => onApprove(proposal.id)}
          >
            ✓ Add to plan
          </button>
          <button
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={() => onReject(proposal.id)}
          >
            ✗ Reject
          </button>
        </div>
      )}
    </div>
  )
}

// ── ProposeExerciseForm ────────────────────────────────────────────────────────

function ProposeExerciseForm({
  onProposed,
  aiConfigured,
}: {
  onProposed: (p: Proposal) => void
  aiConfigured: boolean | null
}) {
  const [workoutId, setWorkoutId] = useState<'A' | 'B'>('A')
  const [request, setRequest] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const disabled = aiConfigured === false

  const submit = async () => {
    if (!request.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/plan/propose', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workoutId, request: request.trim() }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data = (await res.json()) as { proposal: Proposal }
      onProposed(data.proposal)
      setRequest('')
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  if (disabled) {
    return (
      <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
        Claude API key not configured. An admin can add it in Settings.
      </p>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <label style={{ fontSize: 13, fontWeight: 500 }}>Workout</label>
        {(['A', 'B'] as const).map(w => (
          <button
            key={w}
            className={`btn btn-sm ${workoutId === w ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setWorkoutId(w)}
            aria-pressed={workoutId === w}
            disabled={aiConfigured === null}
          >
            {w}
          </button>
        ))}
      </div>
      <textarea
        className="input"
        style={{ width: '100%', minHeight: 72, marginBottom: 8, resize: 'vertical', fontSize: 13 }}
        placeholder='Describe the exercise you want, e.g. "add a rear-delt accessory" or "give us a unilateral hamstring exercise"'
        value={request}
        onChange={e => setRequest(e.target.value)}
        maxLength={500}
        disabled={aiConfigured === null}
      />
      <button
        className="btn btn-primary btn-sm"
        disabled={busy || !request.trim() || aiConfigured === null}
        onClick={submit}
      >
        {busy ? '🤖 Asking Claude…' : '🤖 Propose exercise'}
      </button>
      {error && (
        <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }}>{error}</p>
      )}
    </div>
  )
}

// ── Admin: Anthropic API key card (Phase 18, admin-only) ─────────────────────────

function ApiKeyCard() {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/config/ai-key')
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
      const res = await fetch('/api/admin/config/ai-key', { method: 'DELETE' })
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

// ── Admin: user privilege card (Phase 11, admin-only) ───────────────────────────

interface AdminUser {
  username: string
  level: Privilege
  createdAt: string
}

const LEVEL_OPTIONS: Privilege[] = ['none', 'viewer', 'user', 'admin']

function AdminUsersCard() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [busyUser, setBusyUser] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/admin/users')
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

// ── Rest timer preference card ────────────────────────────────────────────────

function RestTimerCard() {
  const [secs, setSecs] = useState(() => {
    const saved = localStorage.getItem(REST_SECS_KEY)
    return saved ? Number(saved) : REST_SECS_DEFAULT
  })

  const change = (val: number) => {
    setSecs(val)
    localStorage.setItem(REST_SECS_KEY, String(val))
  }

  return (
    <div className="card mb-12">
      <div className="card-title">Rest timer default</div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
        Duration shown after each completed set (except the last). You can still adjust ±15s on the fly during a workout.
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Rest timer duration">
        {REST_SECS_OPTIONS.map(opt => (
          <button
            key={opt.value}
            className={`btn btn-sm ${secs === opt.value ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => change(opt.value)}
            aria-pressed={secs === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main SettingsView ──────────────────────────────────────────────────────────

export default function SettingsView({ onLogout, level }: Props = {}) {
  const { state, dispatch, syncStatus, pendingCount } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [imported, setImported] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [startInput, setStartInput] = useState(state.startDate ?? '')
  const today = todayKey()

  // Confirm dialogs
  const [confirmImport, setConfirmImport] = useState<{ state: Parameters<typeof putServerState>[0] } | null>(null)
  const [confirmStartDate, setConfirmStartDate] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)

  // Phase 8: exercise proposals
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [proposalBusy, setProposalBusy] = useState(false)
  const [proposalMsg, setProposalMsg] = useState<string | null>(null)
  // Phase 10: null = unknown (still checking), true/false = server AI key status
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/plan/proposals?status=pending')
      .then(r => r.json())
      .then((d: { proposals: Proposal[] }) => setProposals(d.proposals))
      .catch(() => { /* not critical */ })
    fetch('/api/plan/ai-status')
      .then(r => r.json())
      .then((d: { configured: boolean }) => setAiConfigured(Boolean(d.configured)))
      .catch(() => setAiConfigured(false))
  }, [])

  const handleApprove = async (id: number) => {
    setProposalBusy(true)
    setProposalMsg(null)
    try {
      const res = await fetch(`/api/plan/approve/${id}`, { method: 'POST' })
      if (!res.ok) {
        const b = (await res.json()) as { error?: string }
        throw new Error(b.error ?? `HTTP ${res.status}`)
      }
      const data = (await res.json()) as { planVersion: number; exercise: ExerciseDef }
      setProposals(prev => prev.map(p => p.id === id ? { ...p, status: 'approved' } : p))
      setProposalMsg(`✓ "${data.exercise.name}" added to plan (version ${data.planVersion}). Reload the app to see it in workouts.`)
    } catch (err) {
      setProposalMsg(`✗ ${String(err)}`)
    } finally {
      setProposalBusy(false)
    }
  }

  const handleReject = async (id: number) => {
    setProposalBusy(true)
    setProposalMsg(null)
    try {
      const res = await fetch(`/api/plan/reject/${id}`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setProposals(prev => prev.map(p => p.id === id ? { ...p, status: 'rejected' } : p))
    } catch (err) {
      setProposalMsg(`✗ ${String(err)}`)
    } finally {
      setProposalBusy(false)
    }
  }

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null)
    setImported(false)
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result as string)
        const valid = validateImport(parsed)
        if (!valid) {
          setImportError(`This doesn't look like a Let's Get Buff backup, or it's from a newer app version.`)
          return
        }
        setConfirmImport({ state: valid })
      } catch {
        setImportError('Could not parse file as JSON.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const doImport = async () => {
    if (!confirmImport) return
    setImportBusy(true)
    try {
      await putServerState(confirmImport.state)
      dispatch({ type: 'REPLACE_STATE', state: confirmImport.state })
      setImported(true)
    } catch {
      setImportError('Imported locally but could not reach the server. Data will sync when back online.')
      dispatch({ type: 'REPLACE_STATE', state: confirmImport.state })
    } finally {
      setImportBusy(false)
      setConfirmImport(null)
    }
  }

  return (
    <div>
      <h2 style={{ display: 'flex', alignItems: 'center' }}>
        Settings
        <SyncBadge status={syncStatus} pending={pendingCount} />
      </h2>

      {/* Start date */}
      <div className="card mb-12">
        <div className="card-title">Program start date</div>
        <input
          type="date"
          className="input mb-8"
          value={startInput}
          max={today}
          onChange={e => setStartInput(e.target.value)}
        />
        <button
          className="btn btn-primary btn-sm"
          disabled={!startInput || startInput === state.startDate}
          onClick={() => setConfirmStartDate(true)}
        >
          Update start date
        </button>
      </div>

      {/* Export */}
      <div className="card mb-12">
        <div className="card-title">Backup your data</div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
          Export current data as a JSON file (exports from server state via this session).
        </p>
        <button className="btn btn-secondary" onClick={() => exportData(state)}>
          Export data
        </button>
      </div>

      {/* Import */}
      <div className="card mb-12">
        <div className="card-title">Restore from backup</div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
          Import a previously exported JSON file. Older backup versions are migrated automatically.
          This replaces data on the server for your account.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />
        <button
          className="btn btn-secondary"
          disabled={importBusy}
          onClick={() => fileRef.current?.click()}
        >
          {importBusy ? 'Importing…' : 'Import data'}
        </button>
        {importError && (
          <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }}>{importError}</p>
        )}
        {imported && (
          <p style={{ color: 'var(--green)', fontSize: 13, marginTop: 8 }}>Data imported and synced to server.</p>
        )}
      </div>

      {/* Rest timer */}
      <RestTimerCard />

      {/* Phase 8: Exercise discovery */}
      <div className="card mb-12">
        <div className="card-title">🤖 Add an exercise with Claude</div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          Describe what you need and Claude will propose a schema-valid exercise following the
          programme guidelines. Review it before it's added to the shared plan.
        </p>
        <ProposeExerciseForm
          onProposed={p => setProposals(prev => [p, ...prev])}
          aiConfigured={aiConfigured}
        />
      </div>

      {/* Pending proposals */}
      {proposals.length > 0 && (
        <div className="card mb-12">
          <div className="card-title">Exercise proposals</div>
          {proposalMsg && (
            <p style={{
              fontSize: 13,
              marginBottom: 10,
              color: proposalMsg.startsWith('✓') ? 'var(--green)' : 'var(--red)',
            }}>
              {proposalMsg}
            </p>
          )}
          {proposals.map(p => (
            <ExerciseProposalCard
              key={p.id}
              proposal={p}
              onApprove={handleApprove}
              onReject={handleReject}
              busy={proposalBusy}
            />
          ))}
        </div>
      )}

      {/* Admin: API key + user access (only rendered for admins) */}
      {level === 'admin' && <ApiKeyCard />}
      {level === 'admin' && <AdminUsersCard />}

      {/* Schema info */}
      <div className="card mb-12">
        <div className="card-title">About</div>
        <div className="muted" style={{ fontSize: 13 }}>
          Schema version: {SCHEMA_VERSION}<br />
          Data stored on your self-hosted server. Local cache kept in browser for offline use.
        </div>
      </div>

      {/* Logout */}
      {onLogout && (
        <div className="card">
          <div className="card-title">Account</div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
            Manage your account in Calibre-Web Automated.
          </p>
          <button
            className="btn btn-secondary"
            onClick={() => setConfirmLogout(true)}
          >
            Sign out
          </button>
        </div>
      )}

      {/* Confirm dialogs */}
      {confirmImport && (
        <ConfirmDialog
          message="Replace all current data with the imported file? This will also update the server."
          confirmLabel="Import"
          danger
          onConfirm={doImport}
          onCancel={() => setConfirmImport(null)}
        />
      )}
      {confirmStartDate && (
        <ConfirmDialog
          message="Changing the start date will recompute your program week. Continue?"
          confirmLabel="Update"
          onConfirm={() => {
            dispatch({ type: 'SET_START_DATE', date: startInput })
            setConfirmStartDate(false)
          }}
          onCancel={() => setConfirmStartDate(false)}
        />
      )}
      {confirmLogout && (
        <ConfirmDialog
          message="Sign out?"
          confirmLabel="Sign out"
          onConfirm={() => { setConfirmLogout(false); onLogout?.() }}
          onCancel={() => setConfirmLogout(false)}
        />
      )}
    </div>
  )
}
