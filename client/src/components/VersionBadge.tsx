import { useState, useEffect, useRef } from 'react'

/**
 * Build identity in the header, next to the bug button.
 *
 * The sha shown is THIS bundle's — baked in at build time — not the server's.
 * That is the whole point: the old badge read its number from /api/health, so a
 * stale service-worker cache still displayed the newest version and there was
 * no way to tell whether a deploy had actually reached you. Here, a mismatch
 * between the baked sha and the server's is surfaced directly, with a reload
 * that clears the service worker.
 */

interface CommitNote {
  sha: string
  shortSha: string
  subject: string
  date: string
  url: string
}

const CLIENT_SHA = __GIT_SHA__
const CLIENT_SHORT = CLIENT_SHA === 'dev' ? 'dev' : CLIENT_SHA.slice(0, 7)

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return days < 30 ? `${days}d ago` : new Date(iso).toLocaleDateString()
}

// Drop the service worker before reloading, otherwise an autoUpdate PWA can
// keep serving the cached bundle for another round-trip. localStorage is left
// alone — it holds the offline cache and the outbound mutation queue.
async function hardReload(): Promise<void> {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.()
    await Promise.all((regs ?? []).map(r => r.unregister()))
  } catch { /* not supported / blocked — a plain reload still helps */ }
  location.reload()
}

// The popover is anchored to the header's right edge rather than the badge, so
// there is a small gap between them. Closing on mouseleave immediately would
// shut it while the pointer crosses that gap.
const CLOSE_DELAY_MS = 250

export default function VersionBadge() {
  const [open, setOpen] = useState(false)
  const [version, setVersion] = useState<number | null>(null)
  const [serverSha, setServerSha] = useState<string | null>(null)
  const [commits, setCommits] = useState<CommitNote[] | null>(null)
  const [repoUrl, setRepoUrl] = useState('https://github.com/andreasschmidtjensen/letsgetbuff')
  const wrapRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelClose = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }
  const openNow = () => { cancelClose(); setOpen(true) }
  const closeSoon = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS)
  }
  useEffect(() => cancelClose, [])

  useEffect(() => {
    fetch('/api/health')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d?.version != null) setVersion(d.version)
        if (d?.sha) setServerSha(d.sha)
      })
      .catch(() => { /* offline — badge still shows the baked sha */ })
  }, [])

  // Commits are only worth fetching once the user actually looks.
  useEffect(() => {
    if (!open || commits !== null) return
    fetch('/api/commits')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        setCommits(d?.commits ?? [])
        if (d?.repoUrl) setRepoUrl(d.repoUrl)
      })
      .catch(() => setCommits([]))
  }, [open, commits])

  // Tap-outside closes on touch, where there is no mouseleave.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  // Only claim staleness when both shas are real and genuinely differ.
  const stale =
    serverSha != null && CLIENT_SHA !== 'dev' && serverSha !== 'dev' && serverSha !== CLIENT_SHA

  const label = version != null ? `v${version} · ${CLIENT_SHORT}` : CLIENT_SHORT

  return (
    <div
      className="version-badge-wrap"
      ref={wrapRef}
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
    >
      <button
        className={`version-badge${stale ? ' version-badge-stale' : ''}`}
        onClick={() => { cancelClose(); setOpen(o => !o) }}
        aria-expanded={open}
        aria-label={stale ? `Build ${CLIENT_SHORT} — update available` : `Build ${CLIENT_SHORT}`}
      >
        {label}{stale ? ' ⚠' : ''}
      </button>

      {open && (
        <div className="version-popover" role="dialog" aria-label="Build details">
          {stale && (
            <div className="version-stale-note">
              <strong>Update available.</strong> This tab is running{' '}
              <code>{CLIENT_SHORT}</code>; the server is on{' '}
              <code>{serverSha!.slice(0, 7)}</code>.
              <button className="btn btn-primary w-full mt-8" onClick={hardReload}>
                Reload to update
              </button>
            </div>
          )}

          <div className="version-popover-title">
            Build <code>{CLIENT_SHORT}</code>
            {version != null && <span className="muted"> · v{version}</span>}
          </div>

          {commits === null && <div className="muted version-note">Loading notes…</div>}
          {commits?.length === 0 && (
            <div className="muted version-note">Notes unavailable offline.</div>
          )}
          {commits && commits.length > 0 && (
            <ul className="version-notes">
              {commits.map(c => (
                <li key={c.sha} className={c.sha.startsWith(CLIENT_SHA) ? 'version-note-current' : ''}>
                  <a href={c.url} target="_blank" rel="noreferrer noopener">{c.subject}</a>
                  <span className="muted"> · {ago(c.date)}</span>
                </li>
              ))}
            </ul>
          )}

          <a
            className="version-repo-link"
            href={repoUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            View repo on GitHub →
          </a>
        </div>
      )}
    </div>
  )
}
