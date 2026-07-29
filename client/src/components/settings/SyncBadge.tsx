import { SyncStatus } from '../../store/store'

// Small sync badge shown at the top of Settings.
export default function SyncBadge({ status, pending }: { status: SyncStatus; pending: number }) {
  const label =
    status === 'guest'    ? '👤 Guest — not saved' :
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
