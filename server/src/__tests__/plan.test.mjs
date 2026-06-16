/**
 * Phase 8 — Plan + exercise proposal logic tests.
 *
 * Fully self-contained: no TypeScript imports, no Fastify, no @fastify/* —
 * the same pattern used by ws.test.mjs to work around FUSE/OneDrive issues.
 *
 * Covers:
 *  1. GET /api/plan equivalent: reads plan from DB
 *  2. Proposal stored as pending with correct fields
 *  3. Approve: exercise appended to plan, version bumped
 *  4. Approve: duplicate id in plan → rejected
 *  5. Approve: duplicate pending proposal → rejected at propose time
 *  6. Reject: proposal status set to rejected
 *  7. validateExerciseDef accepts a valid ExerciseDef
 *  8. validateExerciseDef rejects missing required field
 *  9. validateExerciseDef rejects invalid progressionType
 * 10. validateExerciseDef rejects loaded spinal flexion (safety rule)
 * 11. validateExerciseDef rejects non-kebab-case id
 * 12. Approve re-validates candidate before appending
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'

// ---------------------------------------------------------------------------
// Inline validateExerciseDef (mirrors server/src/claude.ts)
// ---------------------------------------------------------------------------

const VALID_PROGRESSION_TYPES = new Set(['dumbbell', 'legPress', 'rdl', 'cable', 'bodyweight', 'timed'])
const VALID_SAFETY_CUES = new Set(['knee', 'back'])
const FORBIDDEN_MOVEMENTS = ['crunch', 'sit-up', 'situp', 'jefferson', 'good morning']

function validateExerciseDef(raw) {
  if (typeof raw !== 'object' || raw === null) throw new Error('Not an object')

  const required = ['id', 'name', 'progressionType', 'videoUrls', 'alternatives', 'notes', 'safetyCues', 'repProgression']
  for (const k of required) {
    if (!(k in raw)) throw new Error(`Missing field: ${k}`)
  }
  if (typeof raw.id !== 'string' || !/^[a-z0-9-]+$/.test(raw.id)) throw new Error('id must be kebab-case')
  if (typeof raw.name !== 'string') throw new Error('name must be string')
  if (!VALID_PROGRESSION_TYPES.has(raw.progressionType)) throw new Error(`Invalid progressionType: ${raw.progressionType}`)
  if (!Array.isArray(raw.videoUrls) || raw.videoUrls.length === 0) throw new Error('videoUrls must be non-empty array')
  for (const url of raw.videoUrls) {
    if (typeof url !== 'string' || !url.startsWith('https://')) throw new Error(`Invalid videoUrl: ${url}`)
  }
  if (!Array.isArray(raw.safetyCues)) throw new Error('safetyCues must be array')
  for (const c of raw.safetyCues) {
    if (!VALID_SAFETY_CUES.has(c)) throw new Error(`Invalid safetyCue: ${c}`)
  }
  if (typeof raw.repProgression !== 'object' || raw.repProgression === null) throw new Error('repProgression required')
  if (!raw.repProgression.band1 || !raw.repProgression.band2 || !raw.repProgression.band3)
    throw new Error('repProgression must have band1/band2/band3')

  const lower = raw.name.toLowerCase()
  for (const f of FORBIDDEN_MOVEMENTS) {
    if (lower.includes(f)) throw new Error(`Safety violation: "${raw.name}" resembles a forbidden movement (${f})`)
  }

  return {
    id: raw.id,
    name: raw.name,
    sets: typeof raw.sets === 'number' ? raw.sets : 3,
    reps: raw.reps === null ? null : typeof raw.reps === 'number' ? raw.reps : 10,
    ...(raw.seconds != null ? { seconds: raw.seconds } : {}),
    ...(raw.perSide != null ? { perSide: Boolean(raw.perSide) } : {}),
    progressionType: raw.progressionType,
    requiresKg: Boolean(raw.requiresKg),
    videoUrls: raw.videoUrls,
    alternatives: raw.alternatives,
    notes: raw.notes,
    safetyCues: raw.safetyCues,
    ...(raw.minWeek != null ? { minWeek: raw.minWeek } : {}),
    repProgression: raw.repProgression,
  }
}

// ---------------------------------------------------------------------------
// Inline plan API logic (mirrors server/src/api.ts plan routes)
// ---------------------------------------------------------------------------

function getPlanFromDb(db) {
  const row = db.prepare('SELECT json, version FROM plan WHERE id = 1').get()
  if (!row) return null
  return { plan: JSON.parse(row.json), version: row.version }
}

function proposeToDb(db, workoutId, request, exercise) {
  // Gather existing exercise IDs
  const planRow = db.prepare('SELECT json FROM plan WHERE id = 1').get()
  const existingIds = planRow
    ? JSON.parse(planRow.json).workouts.flatMap(w => w.exercises.map(e => e.id))
    : []

  if (existingIds.includes(exercise.id)) return { error: `Duplicate exercise id in plan: ${exercise.id}`, code: 409 }

  const dupProposal = db.prepare(
    "SELECT id FROM plan_proposals WHERE json_extract(json, '$.id') = ? AND status = 'pending'",
  ).get(exercise.id)
  if (dupProposal) return { error: `Duplicate pending proposal id: ${exercise.id}`, code: 409 }

  const result = db.prepare(
    'INSERT INTO plan_proposals (workout_id, request, json) VALUES (?, ?, ?)',
  ).run(workoutId, request, JSON.stringify(exercise))

  return {
    proposal: {
      id: Number(result.lastInsertRowid),
      workoutId, request, exercise, status: 'pending',
      proposedAt: new Date().toISOString(),
    },
  }
}

function approveProposal(db, proposalId) {
  const proposal = db.prepare("SELECT * FROM plan_proposals WHERE id = ? AND status = 'pending'").get(proposalId)
  if (!proposal) return { error: 'Pending proposal not found', code: 404 }

  let exercise
  try {
    exercise = validateExerciseDef(JSON.parse(proposal.json))
  } catch (err) {
    return { error: String(err), code: 422 }
  }

  const planRow = db.prepare('SELECT json, version FROM plan WHERE id = 1').get()
  if (!planRow) return { error: 'Plan row missing', code: 500 }

  const plan = JSON.parse(planRow.json)
  const workout = plan.workouts.find(w => w.id === proposal.workout_id)
  if (!workout) return { error: `Workout ${proposal.workout_id} not found`, code: 400 }

  const allIds = plan.workouts.flatMap(w => w.exercises.map(e => e.id))
  if (allIds.includes(exercise.id)) return { error: `Exercise id already in plan: ${exercise.id}`, code: 409 }

  workout.exercises.push(exercise)
  const newVersion = planRow.version + 1
  plan.version = newVersion
  const now = new Date().toISOString()
  db.prepare('UPDATE plan SET json = ?, version = ? WHERE id = 1').run(JSON.stringify(plan), newVersion)
  db.prepare('UPDATE plan_proposals SET status = ?, reviewed_at = ? WHERE id = ?').run('approved', now, proposalId)

  return { ok: true, planVersion: newVersion, exercise }
}

function rejectProposal(db, proposalId) {
  const proposal = db.prepare("SELECT id FROM plan_proposals WHERE id = ? AND status = 'pending'").get(proposalId)
  if (!proposal) return { error: 'Pending proposal not found', code: 404 }
  const now = new Date().toISOString()
  db.prepare('UPDATE plan_proposals SET status = ?, reviewed_at = ? WHERE id = ?').run('rejected', now, proposalId)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// DB fixture helpers
// ---------------------------------------------------------------------------

const SEED_PLAN = {
  version: 1,
  workouts: [
    {
      id: 'A',
      name: 'Push & Hinge',
      warmup: '10-minute elliptical',
      exercises: [
        {
          id: 'dumbbell-bench-press',
          name: 'Dumbbell Bench Press',
          sets: 3, reps: 10, progressionType: 'dumbbell', requiresKg: true,
          videoUrls: ['https://www.youtube.com/shorts/test1'],
          alternatives: ['Push-up'],
          notes: 'Control the descent.',
          safetyCues: [],
          repProgression: { band1: { sets: 3, reps: 10 }, band2: { sets: 3, reps: 8 }, band3: { sets: 4, reps: 6 } },
        },
      ],
    },
    { id: 'B', name: 'Pull & Quad', warmup: '10-minute rowing', exercises: [] },
  ],
}

const MOCK_EXERCISE = {
  id: 'cable-lateral-raise',
  name: 'Cable Lateral Raise',
  sets: 3, reps: 10, progressionType: 'cable', requiresKg: true,
  videoUrls: ['https://www.youtube.com/shorts/abc123'],
  alternatives: ['Dumbbell lateral raise', 'Band lateral raise'],
  notes: 'Keep arm slightly bent. Lead with elbow.',
  safetyCues: [],
  repProgression: { band1: { sets: 3, reps: 10 }, band2: { sets: 3, reps: 8 }, band3: { sets: 4, reps: 6 } },
}

function makeDb() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE plan (
      id      INTEGER PRIMARY KEY CHECK (id = 1),
      json    TEXT NOT NULL,
      version INTEGER NOT NULL
    );
    CREATE TABLE plan_proposals (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_id  TEXT NOT NULL CHECK (workout_id IN ('A', 'B')),
      request     TEXT NOT NULL,
      json        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      proposed_at TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_at TEXT
    );
  `)
  db.prepare('INSERT INTO plan (id, json, version) VALUES (1, ?, 1)').run(JSON.stringify(SEED_PLAN))
  return db
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('reads plan from DB', () => {
  const db = makeDb()
  const result = getPlanFromDb(db)
  assert.ok(result)
  assert.equal(result.version, 1)
  assert.equal(result.plan.workouts.length, 2)
  assert.equal(result.plan.workouts[0].exercises[0].id, 'dumbbell-bench-press')
})

test('proposal stored as pending with correct fields', () => {
  const db = makeDb()
  const result = proposeToDb(db, 'A', 'add a shoulder accessory', { ...MOCK_EXERCISE })
  assert.ok(result.proposal)
  assert.equal(result.proposal.status, 'pending')
  assert.equal(result.proposal.workoutId, 'A')
  assert.equal(result.proposal.exercise.id, MOCK_EXERCISE.id)

  const row = db.prepare('SELECT * FROM plan_proposals WHERE id = ?').get(result.proposal.id)
  assert.ok(row)
  assert.equal(row.status, 'pending')
  assert.equal(row.workout_id, 'A')
})

test('approve appends exercise to plan and bumps version', () => {
  const db = makeDb()
  const { proposal } = proposeToDb(db, 'A', 'shoulder work', { ...MOCK_EXERCISE })
  const result = approveProposal(db, proposal.id)

  assert.ok(result.ok)
  assert.equal(result.planVersion, 2)
  assert.equal(result.exercise.id, MOCK_EXERCISE.id)

  const planRow = db.prepare('SELECT json, version FROM plan WHERE id = 1').get()
  assert.equal(planRow.version, 2)
  const plan = JSON.parse(planRow.json)
  const allIds = plan.workouts.flatMap(w => w.exercises.map(e => e.id))
  assert.ok(allIds.includes(MOCK_EXERCISE.id))

  const propRow = db.prepare('SELECT status FROM plan_proposals WHERE id = ?').get(proposal.id)
  assert.equal(propRow.status, 'approved')
})

test('approve rejects duplicate id already in plan', () => {
  const db = makeDb()
  const dupExercise = { ...MOCK_EXERCISE, id: 'dumbbell-bench-press' }
  const result = proposeToDb(db, 'A', 'chest work', dupExercise)
  assert.equal(result.code, 409)
  assert.ok(result.error.includes('dumbbell-bench-press'))
})

test('propose rejects duplicate pending proposal id', () => {
  const db = makeDb()
  proposeToDb(db, 'A', 'first request', { ...MOCK_EXERCISE })
  // Second propose with same exercise.id while first is still pending
  const result = proposeToDb(db, 'A', 'second request', { ...MOCK_EXERCISE })
  assert.equal(result.code, 409)
  assert.ok(result.error.includes(MOCK_EXERCISE.id))
})

test('reject sets proposal status to rejected', () => {
  const db = makeDb()
  const { proposal } = proposeToDb(db, 'B', 'hamstring work', { ...MOCK_EXERCISE })
  const result = rejectProposal(db, proposal.id)
  assert.ok(result.ok)

  const row = db.prepare('SELECT status, reviewed_at FROM plan_proposals WHERE id = ?').get(proposal.id)
  assert.equal(row.status, 'rejected')
  assert.ok(row.reviewed_at)
})

test('reject returns 404 for non-existent proposal', () => {
  const db = makeDb()
  const result = rejectProposal(db, 9999)
  assert.equal(result.code, 404)
})

// ---------------------------------------------------------------------------
// validateExerciseDef tests
// ---------------------------------------------------------------------------

test('validateExerciseDef accepts a valid ExerciseDef', () => {
  const result = validateExerciseDef({ ...MOCK_EXERCISE })
  assert.equal(result.id, MOCK_EXERCISE.id)
  assert.equal(result.name, MOCK_EXERCISE.name)
  assert.equal(result.progressionType, 'cable')
})

test('validateExerciseDef rejects missing required field', () => {
  const { repProgression: _rp, ...noRp } = MOCK_EXERCISE
  assert.throws(() => validateExerciseDef(noRp), /Missing field: repProgression/)
})

test('validateExerciseDef rejects invalid progressionType', () => {
  assert.throws(
    () => validateExerciseDef({ ...MOCK_EXERCISE, progressionType: 'machine' }),
    /Invalid progressionType/,
  )
})

test('validateExerciseDef rejects loaded spinal flexion (crunch)', () => {
  assert.throws(
    () => validateExerciseDef({ ...MOCK_EXERCISE, id: 'weighted-crunch', name: 'Weighted Crunch' }),
    /Safety violation/,
  )
})

test('validateExerciseDef rejects non-kebab-case id', () => {
  assert.throws(
    () => validateExerciseDef({ ...MOCK_EXERCISE, id: 'Cable Lateral Raise' }),
    /kebab-case/,
  )
})

test('approve re-validates candidate — rejects invalid stored data', () => {
  const db = makeDb()
  // Directly insert a malformed proposal bypassing proposeToDb
  const bad = { ...MOCK_EXERCISE, progressionType: 'invalid' }
  const r = db.prepare('INSERT INTO plan_proposals (workout_id, request, json) VALUES (?, ?, ?)').run('A', 'test', JSON.stringify(bad))
  const result = approveProposal(db, Number(r.lastInsertRowid))
  assert.equal(result.code, 422)
  assert.ok(result.error.includes('progressionType'))
})
