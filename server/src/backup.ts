/**
 * Daily SQLite backup for buff.db.
 *
 * Backs up to /data/backups/buff-YYYY-MM-DD.db (or alongside BUFF_DB_PATH).
 * Keeps only the most recent MAX_BACKUPS files (default 7).
 *
 * The database runs in WAL mode (see db.ts), so a raw `fs.copyFileSync` of the
 * main .db file can miss transactions still living in the -wal sidecar, yielding
 * a torn/stale backup. Instead we use SQLite's `VACUUM INTO`, which reads a
 * consistent snapshot (regardless of WAL state) and writes a single, fully
 * checkpointed .db file with no -wal/-shm companions to keep together.
 *
 * Restore:
 *   1. Stop the container.
 *   2. Copy the desired backup file over /data/buff.db:
 *        docker cp buff-backup.db <container>:/data/buff.db
 *      or on the host volume:
 *        cp /var/lib/docker/volumes/buff-data/_data/backups/buff-2026-06-14.db \
 *           /var/lib/docker/volumes/buff-data/_data/buff.db
 *   3. Restart the container.
 */

import fs from 'fs'
import path from 'path'
import { DatabaseSync } from 'node:sqlite'

const MAX_BACKUPS = 7
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours

function backupDir(dbPath: string): string {
  return path.join(path.dirname(dbPath), 'backups')
}

function doBackup(dbPath: string): void {
  if (!fs.existsSync(dbPath)) {
    console.warn('[backup] db not found, skipping:', dbPath)
    return
  }

  const dir = backupDir(dbPath)
  fs.mkdirSync(dir, { recursive: true })

  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const dest = path.join(dir, `buff-${date}.db`)

  // VACUUM INTO refuses to overwrite an existing file; a second run on the same
  // day should replace that day's snapshot (matching the old copy behaviour).
  try {
    if (fs.existsSync(dest)) fs.unlinkSync(dest)
  } catch (err) {
    console.error('[backup] could not clear existing snapshot:', err)
    return
  }

  // Open a separate connection to snapshot a consistent, checkpointed copy.
  // VACUUM INTO reads the live db without blocking the main writer.
  let src: DatabaseSync | null = null
  try {
    src = new DatabaseSync(dbPath)
    src.prepare('VACUUM INTO ?').run(dest)
    console.log('[backup] wrote', dest)
  } catch (err) {
    console.error('[backup] VACUUM INTO failed:', err)
    return
  } finally {
    try { src?.close() } catch { /* already closed */ }
  }

  // Prune old backups — keep only the MAX_BACKUPS most recent
  try {
    const files = fs
      .readdirSync(dir)
      .filter(f => /^buff-\d{4}-\d{2}-\d{2}\.db$/.test(f))
      .sort() // lexicographic = chronological for ISO dates
    const toDelete = files.slice(0, Math.max(0, files.length - MAX_BACKUPS))
    for (const f of toDelete) {
      fs.unlinkSync(path.join(dir, f))
      console.log('[backup] pruned', f)
    }
  } catch (err) {
    console.warn('[backup] prune failed:', err)
  }
}

/**
 * Start the backup scheduler.
 * Runs once immediately (so we have a fresh backup on start), then every 24h.
 * Returns a cleanup function that stops the interval.
 */
export function startBackupScheduler(dbPath: string): () => void {
  console.log('[backup] scheduler started; db =', dbPath)
  doBackup(dbPath) // immediate on start

  const timer = setInterval(() => doBackup(dbPath), BACKUP_INTERVAL_MS)
  timer.unref() // don't hold the process open

  return () => clearInterval(timer)
}
