import { useRef, useState, useEffect } from 'react'
import { useStore } from '../store/store'
import { isGuestMode } from '../store/guest'
import { exportData, validateImport, putServerState } from '../store/persistence'
import { todayKey, SCHEMA_VERSION } from '@letsgetbuff/shared'
import type { ExerciseDef, Privilege } from '@letsgetbuff/shared'
import ConfirmDialog from '../components/ConfirmDialog'
import SyncBadge from '../components/settings/SyncBadge'
import { Proposal, ExerciseProposalCard, ProposeExerciseForm } from '../components/settings/proposals'
import ApiKeyCard from '../components/settings/ApiKeyCard'
import AdminUsersCard from '../components/settings/AdminUsersCard'
import GithubConnectCard, { GithubStatus } from '../components/settings/GithubConnectCard'
import GithubClientIdCard from '../components/settings/GithubClientIdCard'
import { RestTimerCard, TimerSoundCard, TestModeCard, UiVersionCard } from '../components/settings/preferenceCards'

interface Props {
  onLogout?: () => void
  level?: Privilege
}

export default function SettingsView({ onLogout, level }: Props = {}) {
  // Guests get the preference cards only: everything that reads or writes an
  // account (backup/restore, AI proposals, GitHub, admin) is hidden.
  const guest = isGuestMode()
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

  // GitHub bug reporting: single status fetch shared by connect + report cards
  const [githubStatus, setGithubStatus] = useState<GithubStatus | null>(null)

  useEffect(() => {
    if (guest) return   // these endpoints all require a session cookie
    fetch('/api/plan/proposals?status=pending', { credentials: 'include' })
      .then(r => r.json())
      .then((d: { proposals: Proposal[] }) => setProposals(d.proposals))
      .catch(() => { /* not critical */ })
    fetch('/api/plan/ai-status', { credentials: 'include' })
      .then(r => r.json())
      .then((d: { configured: boolean }) => setAiConfigured(Boolean(d.configured)))
      .catch(() => setAiConfigured(false))
    fetch('/api/github/status', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: GithubStatus) => setGithubStatus(d))
      .catch(() => setGithubStatus({ configured: false, connected: false, githubLogin: null }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleApprove = async (id: number) => {
    setProposalBusy(true)
    setProposalMsg(null)
    try {
      const res = await fetch(`/api/plan/approve/${id}`, { method: 'POST', credentials: 'include' })
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
      const res = await fetch(`/api/plan/reject/${id}`, { method: 'POST', credentials: 'include' })
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
    <div className="cards-grid">
      <h2 style={{ display: 'flex', alignItems: 'center' }}>
        Settings
        <SyncBadge status={syncStatus} pending={pendingCount} />
      </h2>

      {/* Test mode (frontend-only sandbox) — guest mode already is one */}
      {!guest && <TestModeCard />}

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
      {!guest && <div className="card mb-12">
        <div className="card-title">Backup your data</div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
          Export current data as a JSON file (exports from server state via this session).
        </p>
        <button className="btn btn-secondary" onClick={() => exportData(state)}>
          Export data
        </button>
      </div>}

      {/* Import */}
      {!guest && <div className="card mb-12">
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
      </div>}

      {/* New workout screens (v2) */}
      <UiVersionCard />

      {/* Rest timer */}
      <RestTimerCard />

      {/* Timer sound */}
      <TimerSoundCard />

      {/* Phase 8: Exercise discovery — changes the shared plan, so not for guests */}
      {!guest && <div className="card mb-12">
        <div className="card-title">🤖 Add an exercise with Claude</div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          Describe what you need and Claude will propose a schema-valid exercise following the
          programme guidelines. Review it before it's added to the shared plan.
        </p>
        <ProposeExerciseForm
          onProposed={p => setProposals(prev => [p, ...prev])}
          aiConfigured={aiConfigured}
        />
      </div>}

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

      {/* GitHub account for bug reporting (the report form is the 🐛 header popup) */}
      {!guest && <GithubConnectCard status={githubStatus} onChange={setGithubStatus} />}

      {/* Admin: API key + GitHub client ID + user access (only rendered for admins) */}
      {level === 'admin' && <ApiKeyCard />}
      {level === 'admin' && (
        <GithubClientIdCard
          onConfiguredChange={configured => setGithubStatus(s =>
            s ? { ...s, configured } : { configured, connected: false, githubLogin: null })}
        />
      )}
      {level === 'admin' && <AdminUsersCard />}

      {/* Schema info */}
      <div className="card mb-12">
        <div className="card-title">About</div>
        <div className="muted" style={{ fontSize: 13 }}>
          Schema version: {SCHEMA_VERSION}<br />
          {guest
            ? 'Guest session — everything you log stays in this tab and is discarded on reload.'
            : 'Data stored on your self-hosted server. Local cache kept in browser for offline use.'}
        </div>
      </div>

      {/* Logout / leave guest mode */}
      {onLogout && (
        <div className="card">
          <div className="card-title">Account</div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
            {guest
              ? 'You are browsing as a guest. Sign in to save your training.'
              : 'Manage your account in Calibre-Web Automated.'}
          </p>
          <button
            className="btn btn-secondary"
            onClick={() => setConfirmLogout(true)}
          >
            {guest ? 'Sign in' : 'Sign out'}
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
          message={guest ? 'Leave guest mode? Anything you logged is discarded.' : 'Sign out?'}
          confirmLabel={guest ? 'Leave' : 'Sign out'}
          onConfirm={() => { setConfirmLogout(false); onLogout?.() }}
          onCancel={() => setConfirmLogout(false)}
        />
      )}
    </div>
  )
}
