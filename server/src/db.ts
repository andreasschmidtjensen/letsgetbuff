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

const CURRENT_DB_VERSION = 5

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
  3: (db) => {
    // Phase 11: per-account privilege level (GYMN-only, never written to CWA's app.db).
    // none < viewer < user < admin. First-ever login bootstraps to 'admin' (see auth.ts).
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_privilege (
        user_id    INTEGER PRIMARY KEY REFERENCES users(id),
        level      TEXT NOT NULL DEFAULT 'user'
                   CHECK (level IN ('none','viewer','user','admin')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)
  },
  4: (db) => {
    // Phase 12: real training-session entity (supersedes the single fixed live_order room).
    // A session links 1–2 of the two users, has a lifecycle, and owns the live order.
    db.exec(`
      CREATE TABLE IF NOT EXISTS session (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        scope_date  TEXT NOT NULL,
        workout     TEXT NOT NULL,
        mode        TEXT NOT NULL DEFAULT 'solo'   CHECK (mode IN ('solo','shared')),
        status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
        created_by  INTEGER NOT NULL REFERENCES users(id),
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at    TEXT
      );
      CREATE TABLE IF NOT EXISTS session_participant (
        session_id  INTEGER NOT NULL REFERENCES session(id),
        user_id     INTEGER NOT NULL REFERENCES users(id),
        joined_at   TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (session_id, user_id)
      );
    `)
    // live_order becomes session-scoped: one row per session_id (was the id=1 singleton).
    // Back-compat: preserve any legacy row under live_order_legacy; the session-aware seam
    // (sessions.ts) never reads it.
    db.exec('ALTER TABLE live_order RENAME TO live_order_legacy')
    db.exec(`
      CREATE TABLE live_order (
        session_id          INTEGER PRIMARY KEY REFERENCES session(id),
        exercise_order_json TEXT NOT NULL,
        version             INTEGER NOT NULL DEFAULT 0,
        scope_date          TEXT,
        scope_workout       TEXT,
        updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)
  },
  5: (db) => {
    // Phase 18: server-side config store (Anthropic API key, admin-editable).
    db.exec(`
      CREATE TABLE IF NOT EXISTS server_config (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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

// ---- Open -------------------------------------------------------------------

export function openDb(): Db {
  const db = new DatabaseSync(config.buffDbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  runMigrations(db)
  seedPlan(db)
  // live_order is session-scoped (Phase 12) and seeded per session on creation —
  // no global row to seed here.
  console.log('[db] Ready at', config.buffDbPath)
  return db
}
