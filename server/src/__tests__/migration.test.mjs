/**
 * DB migration 10 + pre-migration snapshot tests.
 *
 * Fully self-contained (no TypeScript imports), same pattern as plan.test.mjs:
 * the migration body and snapshot helper are inlined mirrors of
 * server/src/db.ts. Covers:
 *  1. Migration 10 copies load + rationale onto catalog exercises in the
 *     stored plan row, bumps the version, and preserves order/warmups.
 *  2. AI-added exercises (unknown to the catalog) are preserved untouched.
 *  3. Fields already present are not overwritten.
 *  4. Missing plan row (fresh DB) is a no-op.
 *  5. snapshotBeforeMigration writes a readable pre-migration copy and
 *     replaces a leftover snapshot of the same version.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

// ---------------------------------------------------------------------------
// Inline catalog stand-in (what getExercise(id) resolves against in db.ts —
// the server's getPlan() is always the seeded DEFAULT_PLAN)
// ---------------------------------------------------------------------------

const CATALOG = new Map([
  ['dumbbell-bench-press', {
    id: 'dumbbell-bench-press',
    load: 'perHand',
    rationale: { purpose: 'The horizontal push: chest, front delts and triceps.' },
  }],
  ['face-pull', {
    id: 'face-pull',
    load: 'total',
    rationale: {
      purpose: 'Shoulder health, not strength.',
      repScheme: 'High reps on purpose: light load needs 15 reps to be a stimulus.',
    },
  }],
  ['back-extension', {
    id: 'back-extension',
    name: 'Back Extension',
    load: 'single',
    rationale: { purpose: 'Direct lower-back and glute work.' },
  }],
])

const getExercise = (id) => CATALOG.get(id)

// ---------------------------------------------------------------------------
// Inline migration 10 (mirrors server/src/db.ts MIGRATIONS[10])
// ---------------------------------------------------------------------------

function migration10(db) {
  const row = db.prepare('SELECT json, version FROM plan WHERE id = 1').get()
  if (!row) return
  try {
    const plan = JSON.parse(row.json)
    for (const w of plan.workouts) {
      for (const e of w.exercises) {
        const def = getExercise(e.id)
        if (!def) continue
        if (def.load && e.load == null) e.load = def.load
        if (def.rationale && e.rationale == null) e.rationale = def.rationale
      }
    }
    plan.version = row.version + 1
    db.prepare('UPDATE plan SET json = ?, version = ? WHERE id = 1').run(
      JSON.stringify(plan), plan.version,
    )
  } catch (err) {
    console.error('[db] Migration 10: could not add load modes and rationale', err)
  }
}

// ---------------------------------------------------------------------------
// Inline migration 11 (mirrors server/src/db.ts MIGRATIONS[11])
// ---------------------------------------------------------------------------

function migration11(db) {
  const row = db.prepare('SELECT json, version FROM plan WHERE id = 1').get()
  if (!row) return
  try {
    const plan = JSON.parse(row.json)
    const w = plan.workouts.find(x => x.id === 'B')
    const def = getExercise('back-extension')
    if (w && def && !w.exercises.some(e => e.id === 'back-extension')) {
      const after = w.exercises.findIndex(e => e.id === 'lat-pulldown')
      w.exercises.splice(after >= 0 ? after + 1 : w.exercises.length, 0, def)
    }
    plan.version = row.version + 1
    db.prepare('UPDATE plan SET json = ?, version = ? WHERE id = 1').run(
      JSON.stringify(plan), plan.version,
    )
  } catch (err) {
    console.error('[db] Migration 11: could not append back extension', err)
  }
}

// ---------------------------------------------------------------------------
// Inline snapshotBeforeMigration (mirrors server/src/db.ts)
// ---------------------------------------------------------------------------

function snapshotBeforeMigration(db, dbPath, fromVersion) {
  const dir = path.join(path.dirname(dbPath), 'backups')
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, `buff-pre-migration-v${fromVersion}.db`)
  if (fs.existsSync(dest)) fs.unlinkSync(dest)
  db.prepare('VACUUM INTO ?').run(dest)
  return dest
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDb() {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE plan (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL, version INTEGER NOT NULL)')
  return db
}

// A v4-shaped stored plan: one catalog exercise, one AI-added exercise,
// non-catalog order (AI exercise first) and a custom warmup.
function seedV4Plan(db) {
  const plan = {
    version: 4,
    workouts: [
      {
        id: 'A',
        name: 'Push & Hinge',
        warmup: 'custom warmup kept by migrations',
        exercises: [
          { id: 'ai-cable-lateral-raise', name: 'Cable Lateral Raise', progressionType: 'cable' },
          { id: 'dumbbell-bench-press', name: 'Dumbbell Bench Press', progressionType: 'dumbbell' },
          { id: 'face-pull', name: 'Face Pull', progressionType: 'cable', load: 'perHand' /* pre-set: must not be overwritten */ },
        ],
      },
    ],
  }
  db.prepare('INSERT INTO plan (id, json, version) VALUES (1, ?, ?)').run(JSON.stringify(plan), plan.version)
  return plan
}

const readPlan = (db) => {
  const row = db.prepare('SELECT json, version FROM plan WHERE id = 1').get()
  return { plan: JSON.parse(row.json), version: row.version }
}

// ---------------------------------------------------------------------------
// Migration 10 tests
// ---------------------------------------------------------------------------

test('migration 10 copies load + rationale onto catalog exercises and bumps version', () => {
  const db = makeDb()
  seedV4Plan(db)
  migration10(db)

  const { plan, version } = readPlan(db)
  assert.equal(version, 5)
  assert.equal(plan.version, 5)

  const bench = plan.workouts[0].exercises.find(e => e.id === 'dumbbell-bench-press')
  assert.equal(bench.load, 'perHand')
  assert.equal(bench.rationale.purpose, 'The horizontal push: chest, front delts and triceps.')
})

test('migration 10 leaves AI-added exercises untouched but preserved, order intact', () => {
  const db = makeDb()
  const before = seedV4Plan(db)
  migration10(db)

  const { plan } = readPlan(db)
  assert.deepEqual(
    plan.workouts[0].exercises.map(e => e.id),
    before.workouts[0].exercises.map(e => e.id), // order preserved
  )
  const ai = plan.workouts[0].exercises.find(e => e.id === 'ai-cable-lateral-raise')
  assert.deepEqual(ai, { id: 'ai-cable-lateral-raise', name: 'Cable Lateral Raise', progressionType: 'cable' })
  assert.equal(plan.workouts[0].warmup, 'custom warmup kept by migrations')
})

test('migration 10 does not overwrite fields already present', () => {
  const db = makeDb()
  seedV4Plan(db)
  migration10(db)

  const { plan } = readPlan(db)
  const facePull = plan.workouts[0].exercises.find(e => e.id === 'face-pull')
  assert.equal(facePull.load, 'perHand') // the (wrong on purpose) pre-set value survives
  assert.equal(facePull.rationale.purpose, 'Shoulder health, not strength.') // absent field still filled
})

test('migration 10 is a no-op on a fresh DB with no plan row', () => {
  const db = makeDb()
  migration10(db) // must not throw
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM plan').get().n, 0)
})

// ---------------------------------------------------------------------------
// Migration 11 tests
// ---------------------------------------------------------------------------

test('migration 11 inserts back extension after the lat pulldown in B', () => {
  const db = makeDb()
  const plan = {
    version: 5,
    workouts: [{
      id: 'B', name: 'Pull & Quad',
      exercises: [{ id: 'leg-press' }, { id: 'lat-pulldown' }, { id: 'dumbbell-curl' }],
    }],
  }
  db.prepare('INSERT INTO plan (id, json, version) VALUES (1, ?, ?)').run(JSON.stringify(plan), plan.version)
  migration11(db)

  const after = readPlan(db)
  assert.equal(after.version, 6)
  assert.deepEqual(
    after.plan.workouts[0].exercises.map(e => e.id),
    ['leg-press', 'lat-pulldown', 'back-extension', 'dumbbell-curl'],
  )
  const be = after.plan.workouts[0].exercises.find(e => e.id === 'back-extension')
  assert.equal(be.load, 'single')
})

test('migration 11 appends at the end when the lat pulldown was reordered away, and never duplicates', () => {
  const db = makeDb()
  const plan = { version: 5, workouts: [{ id: 'B', exercises: [{ id: 'leg-press' }] }] }
  db.prepare('INSERT INTO plan (id, json, version) VALUES (1, ?, ?)').run(JSON.stringify(plan), plan.version)
  migration11(db)
  let after = readPlan(db)
  assert.deepEqual(after.plan.workouts[0].exercises.map(e => e.id), ['leg-press', 'back-extension'])

  migration11(db) // re-run (e.g. crash before setDbVersion): no duplicate
  after = readPlan(db)
  assert.deepEqual(after.plan.workouts[0].exercises.map(e => e.id), ['leg-press', 'back-extension'])
})

// ---------------------------------------------------------------------------
// Pre-migration snapshot tests
// ---------------------------------------------------------------------------

test('snapshotBeforeMigration writes a readable copy and replaces a leftover', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buff-migration-test-'))
  const dbPath = path.join(dir, 'buff.db')
  try {
    const db = new DatabaseSync(dbPath)
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('CREATE TABLE plan (id INTEGER PRIMARY KEY, json TEXT NOT NULL, version INTEGER NOT NULL)')
    db.prepare('INSERT INTO plan (id, json, version) VALUES (1, ?, 4)').run('{"version":4}')

    const dest = snapshotBeforeMigration(db, dbPath, 9)
    assert.equal(dest, path.join(dir, 'backups', 'buff-pre-migration-v9.db'))
    const snap1 = new DatabaseSync(dest)
    assert.equal(snap1.prepare('SELECT version FROM plan WHERE id = 1').get().version, 4)
    snap1.close()

    // A leftover snapshot of the same version is replaced, not fatal.
    db.prepare('UPDATE plan SET version = 400 WHERE id = 1').run()
    snapshotBeforeMigration(db, dbPath, 9)
    const snap2 = new DatabaseSync(dest)
    assert.equal(snap2.prepare('SELECT version FROM plan WHERE id = 1').get().version, 400)
    snap2.close()
    db.close()
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
