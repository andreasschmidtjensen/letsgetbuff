/**
 * Database layer — Node.js built-in node:sqlite (Node >= 22) + migration ladder.
 *
 * Uses the built-in `node:sqlite` module (synchronous, no native compilation).
 * API is close to better-sqlite3; swap is trivial if needed later.
 *
 * Tables (per master brief):
 *   schema_version  -- single-row version tracker
 *   users           -- one row per CWA username (Phase 3)
 *   app_state       -- per-user AppState JSON blob (Phase 4)
 *   plan            -- shared workout plan as data, seeded from catalog
 *   live_order      -- shared exercise order for live reorder (Phase 6)
 *   plan_proposals  -- Claude-generated exercise candidates awaiting approval (Phase 8)
 */

import { DatabaseSync } from 'node:sqlite'
import { getPlan } from '@letsgetbuff/shared'
import { config } from './config.js'

export type Db = DatabaseSync

// ---- Migration ladder -------------------------------------------------------

const CURRENT_DB_VERSION = 2

type Migration = (db: DatabaseSync) => void

const MIGRATIONS: Record<number, Migration> = {
  1: (db) => {
    // Initial schema (Phases 1-7)
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        id      INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS users (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        cwa_username TEXT UNIQUE NOT NULL,
        created_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS app_state (
        user_id        INTEGER PRIMARY KEY REFERENCES users(id),
        json           TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS plan (
        id      INTEGER PRIMARY KEY CHECK (id = 1),
        json    TEXT NOT NULL,
        version INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS live_order (
        id                   INTEGER PRIMARY KEY CHECK (id = 1),
        exercise_order_json  TEXT NOT NULL,
        version              INTEGER NOT NULL DEFAULT 0,
        updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)
  },
  2: (db) => {
    // Phase 8: Claude-generated exercise proposals
    db.exec(`
      CREATE TABLE IF NOT EXISTS plan_proposals (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        workout_id  TEXT NOT NULL CHECK (workout_id IN ('A', 'B')),
        request     TEXT NOT NULL,
        json        TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        proposed_at TEXT NOT NULL DEFAULT (datetime('now')),
        reviewed_at TEXT
      );
    `)
  },
}

function getDbVersion(db: DatabaseSync): number {
  try {
    const row = db.prepare('SELECT version FROM schema_version WHERE id = 1').get() as
      | { version: number }
      | undefined
    return row?.version ?? 0
  } catch {
    return 0
  }
}

function setDbVersion(db: DatabaseSync, version: number): void {
  db.prepare(
    'INSERT INTO schema_version (id, version) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET version = excluded.version',
  ).run(1, version)
}

function runMigrations(db: DatabaseSync): void {
  const current = getDbVersion(db)
  if (current >= CURRENT_DB_VERSION) return
  for (let v = current + 1; v <= CURRENT_DB_VERSION; v++) {
    const migration = MIGRATIONS[v]
    if (!migration) throw new Error(`Missing DB migration for version ${v}`)
    console.log('[db] Running migration to version', v)
    migration(db)
    setDbVersion(db, v)
  }
  console.log('[db] Schema at version', CURRENT_DB_VERSION)
}

// ---- Seeding ----------------------------------------------------------------

function seedPlan(db: DatabaseSync): void {
  const existing = db.prepare('SELECT id FROM plan WHERE id = 1').get()
  if (existing) return
  const plan = getPlan()
  db.prepare('INSERT INTO plan (id, json, version) VALUES (?, ?, ?)').run(
    1, JSON.stringify(plan), plan.version,
  )
  console.log('[db] Seeded plan (version', plan.version + ')')
}

function seedLiveOrder(db: DatabaseSync): void {
  const existing = db.prepare('SELECT id FROM live_order WHERE id = 1').get()
  if (existing) return
  const plan = getPlan()
  const allIds = plan.workouts.flatMap((w) => w.exercises.map((e) => e.id))
  db.prepare(
    'INSERT INTO live_order (id, exercise_order_json, version) VALUES (?, ?, 0)',
  ).run(1, JSON.stringify(allIds))
  console.log('[db] Seeded live_order with', allIds.length, 'ids')
}

// ---- Open -------------------------------------------------------------------

export function openDb(): Db {
  const db = new DatabaseSync(config.buffDbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  runMigrations(db)
  seedPlan(db)
  seedLiveOrder(db)
  console.log('[db] Ready at', config.buffDbPath)
  return db
}
