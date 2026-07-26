import { useState, useEffect } from 'react'
import { StoreProvider } from './store/store'
import { TestModeProvider } from './store/testMode'
import { EinkModeProvider, useEinkMode } from './store/einkMode'
import { Tab, Privilege } from '@letsgetbuff/shared'
import HomeView from './views/HomeView'
import WorkoutView from './views/WorkoutView'
import StretchView from './views/StretchView'
import HomeTrainingView from './views/HomeTrainingView'
import MetricsView from './views/MetricsView'
import MilestonesView from './views/MilestonesView'
import SettingsView from './views/SettingsView'
import LoginView from './views/LoginView'
import HistoryView from './views/HistoryView'
import TestModeBanner from './components/TestModeBanner'
import ErrorBoundary from './components/ErrorBoundary'
import BugReportModal from './components/BugReportModal'
import './app.css'

const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'workout', label: 'Workout' },
  { id: 'stretch', label: 'Stretch' },
  { id: 'hometraining', label: 'At home' },
  { id: 'history', label: 'History' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'milestones', label: 'Goals' },
  { id: 'settings', label: 'Settings' },
]

type AuthState = 'checking' | 'unauthenticated' | 'authenticated'

function useAuth() {
  const [authState, setAuthState] = useState<AuthState>('checking')
  const [username, setUsername] = useState<string | null>(null)
  const [level, setLevel] = useState<Privilege>('user')

  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json()
          setUsername(data.username)
          setLevel((data.level as Privilege) ?? 'user')
          setAuthState('authenticated')
        } else {
          setAuthState('unauthenticated')
        }
      })
      .catch(() => setAuthState('unauthenticated'))
  }, [])

  function onLogin(name: string, lvl: Privilege) {
    setUsername(name)
    setLevel(lvl ?? 'user')
    setAuthState('authenticated')
  }

  async function onLogout() {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' })
    setUsername(null)
    setLevel('user')
    setAuthState('unauthenticated')
  }

  return { authState, username, level, onLogin, onLogout }
}

function HeaderVersion() {
  const [version, setVersion] = useState<number | null>(null)
  useEffect(() => {
    fetch('/api/health')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.version != null) setVersion(d.version) })
      .catch(() => { /* offline — leave blank */ })
  }, [])
  if (version == null) return null
  return <span className="app-version">v{version}</span>
}

function AppInner({ username, level, onLogout }: { username: string; level: Privilege; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('home')
  const [bugReportOpen, setBugReportOpen] = useState(false)
  const { einkMode, setEinkMode } = useEinkMode()

  return (
    <div className="app">
      <TestModeBanner />
      <header className="app-header">
        <div className="app-title-wrap">
          <span className="app-title">Let's Get Buff</span>
          <HeaderVersion />
        </div>
        <button
          className="theme-toggle"
          onClick={() => setEinkMode(!einkMode)}
          aria-pressed={einkMode}
          title="Toggle e-ink / colour theme"
          aria-label={einkMode ? 'Switch to colour theme' : 'Switch to e-ink theme'}
        >
          {einkMode ? '● Colour' : '◐ E-ink'}
        </button>
        <button
          className="theme-toggle"
          style={{ marginLeft: 8 }}
          onClick={() => setBugReportOpen(true)}
          title="Report a bug"
          aria-label="Report a bug"
        >
          🐛
        </button>
        <span className="header-user">{username}</span>
      </header>
      {bugReportOpen && (
        <BugReportModal
          onClose={() => setBugReportOpen(false)}
          onGoToSettings={() => { setBugReportOpen(false); setTab('settings') }}
        />
      )}
      <main className="app-main">
        <div className="view-container">
          {tab === 'home'      && <HomeView onNavigate={setTab} />}
          {tab === 'workout'   && <WorkoutView username={username} level={level} onNavigate={setTab} />}
          {tab === 'stretch'   && <StretchView />}
          {tab === 'hometraining' && <HomeTrainingView />}
          {tab === 'history'   && <HistoryView username={username} />}
          {tab === 'metrics'   && <MetricsView />}
          {tab === 'milestones'&& <MilestonesView />}
          {tab === 'settings'  && <SettingsView onLogout={onLogout} level={level} />}
        </div>
      </main>
      <nav className="app-nav">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`nav-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppRoutes />
    </ErrorBoundary>
  )
}

function AppRoutes() {
  const { authState, username, level, onLogin, onLogout } = useAuth()

  if (authState === 'checking') {
    return (
      <div style={{
        height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', color: 'var(--text-muted)',
      }}>
        Loading...
      </div>
    )
  }

  if (authState === 'unauthenticated') {
    return <LoginView onLogin={onLogin} />
  }

  return (
    <EinkModeProvider>
      <TestModeProvider>
        <StoreProvider username={username!}>
          <AppInner username={username!} level={level} onLogout={onLogout} />
        </StoreProvider>
      </TestModeProvider>
    </EinkModeProvider>
  )
}
