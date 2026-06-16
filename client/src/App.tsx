import { useState, useEffect } from 'react'
import { StoreProvider } from './store/store'
import { Tab } from '@letsgetbuff/shared'
import HomeView from './views/HomeView'
import WorkoutView from './views/WorkoutView'
import MetricsView from './views/MetricsView'
import MilestonesView from './views/MilestonesView'
import SettingsView from './views/SettingsView'
import LoginView from './views/LoginView'
import HistoryView from './views/HistoryView'
import './app.css'

const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'workout', label: 'Workout' },
  { id: 'history', label: 'History' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'milestones', label: 'Goals' },
  { id: 'settings', label: 'Settings' },
]

type AuthState = 'checking' | 'unauthenticated' | 'authenticated'

function useAuth() {
  const [authState, setAuthState] = useState<AuthState>('checking')
  const [username, setUsername] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json()
          setUsername(data.username)
          setAuthState('authenticated')
        } else {
          setAuthState('unauthenticated')
        }
      })
      .catch(() => setAuthState('unauthenticated'))
  }, [])

  function onLogin(name: string) {
    setUsername(name)
    setAuthState('authenticated')
  }

  async function onLogout() {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' })
    setUsername(null)
    setAuthState('unauthenticated')
  }

  return { authState, username, onLogin, onLogout }
}

function AppInner({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('home')

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">Let's Get Buff</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {username}
        </span>
      </header>
      <main className="app-main">
        {tab === 'home'      && <HomeView onNavigate={setTab} />}
        {tab === 'workout'   && <WorkoutView username={username} />}
        {tab === 'history'   && <HistoryView />}
        {tab === 'metrics'   && <MetricsView />}
        {tab === 'milestones'&& <MilestonesView />}
        {tab === 'settings'  && <SettingsView onLogout={onLogout} />}
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
  const { authState, username, onLogin, onLogout } = useAuth()

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
    <StoreProvider username={username!}>
      <AppInner username={username!} onLogout={onLogout} />
    </StoreProvider>
  )
}
