/**
 * Unit tests for verifyWerkzeugHash — Node built-in test runner.
 * Run: node --test server/src/__tests__/auth.test.mjs
 *
 * Hashes generated with Werkzeug for password 'testpassword123'.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, pbkdf2Sync, scryptSync, timingSafeEqual } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

function verifyWerkzeugHash(storedHash, password) {
  try {
    const dollarIdx = storedHash.indexOf('$')
    if (dollarIdx === -1) return false
    const method = storedHash.slice(0, dollarIdx)
    const rest = storedHash.slice(dollarIdx + 1)
    const secondDollar = rest.indexOf('$')
    if (secondDollar === -1) return false
    const salt = rest.slice(0, secondDollar)
    const expected = rest.slice(secondDollar + 1)
    let computed

    if (method.startsWith('pbkdf2:')) {
      const parts = method.split(':')
      if (parts.length !== 3) return false
      const hashName = parts[1]
      const iterations = parseInt(parts[2], 10)
      if (isNaN(iterations) || iterations < 1) return false
      const keylen = createHash(hashName).digest().length
      computed = pbkdf2Sync(password, salt, iterations, keylen, hashName).toString('hex')

    } else if (method.startsWith('scrypt:')) {
      const parts = method.split(':')
      if (parts.length !== 4) return false
      const N = parseInt(parts[1], 10)
      const r = parseInt(parts[2], 10)
      const p = parseInt(parts[3], 10)
      if ([N, r, p].some(n => isNaN(n) || n < 1)) return false
      const keylen = Buffer.from(expected, 'hex').length
      const maxmem = 128 * N * r * p + 1024 * 1024
      computed = scryptSync(password, salt, keylen, { N, r, p, maxmem }).toString('hex')

    } else {
      return false
    }

    const computedBuf = Buffer.from(computed, 'hex')
    const expectedBuf = Buffer.from(expected, 'hex')
    if (computedBuf.length !== expectedBuf.length) return false
    return timingSafeEqual(computedBuf, expectedBuf)
  } catch {
    return false
  }
}

const SCRYPT_HASH = 'scrypt:32768:8:1$gDTSxbOUTsPcW8rB$1d826206b1873f2e7eadd6d573560ba7a9e18b932539256d79c4d3f9e95da4ef46e3fd26ea6ad4efa91fdb220f9028f968c2e5a19c2d13ab546cb3ee70c0436b'
const PBKDF2_HASH = 'pbkdf2:sha256:1000000$m9RRVon6AAusbZcV$94f11356d9a42447e9275b05f136db84d557ad15611633f6c2fa7bc94c405d33'
const CORRECT_PW = 'testpassword123'
const WRONG_PW = 'wrongpassword'

test('scrypt: correct password verifies', () => {
  assert.equal(verifyWerkzeugHash(SCRYPT_HASH, CORRECT_PW), true)
})

test('scrypt: wrong password is rejected', () => {
  assert.equal(verifyWerkzeugHash(SCRYPT_HASH, WRONG_PW), false)
})

test('pbkdf2:sha256: correct password verifies', () => {
  assert.equal(verifyWerkzeugHash(PBKDF2_HASH, CORRECT_PW), true)
})

test('pbkdf2:sha256: wrong password is rejected', () => {
  assert.equal(verifyWerkzeugHash(PBKDF2_HASH, WRONG_PW), false)
})

test('malformed hash returns false', () => {
  assert.equal(verifyWerkzeugHash('notahash', CORRECT_PW), false)
  assert.equal(verifyWerkzeugHash('', CORRECT_PW), false)
  assert.equal(verifyWerkzeugHash('unknown:method$salt$hash', CORRECT_PW), false)
})

// ---------------------------------------------------------------------------
// Phase 11 — Privilege levels. Self-contained: mirrors ensureUserAndPrivilege
// (auth.ts), the login none-gate (auth.ts), and the admin level-change guard
// (api.ts). Run against an in-memory SQLite matching the v3 schema.
// ---------------------------------------------------------------------------

function makePrivDb() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cwa_username TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE user_privilege (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      level TEXT NOT NULL DEFAULT 'user' CHECK (level IN ('none','viewer','user','admin')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  return db
}

// mirror of server/src/auth.ts ensureUserAndPrivilege
function ensureUserAndPrivilege(db, username) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const priorCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n
    db.prepare('INSERT INTO users (cwa_username) VALUES (?) ON CONFLICT(cwa_username) DO NOTHING').run(username)
    const { id } = db.prepare('SELECT id FROM users WHERE cwa_username = ?').get(username)
    const existing = db.prepare('SELECT level FROM user_privilege WHERE user_id = ?').get(id)
    let level
    if (existing) {
      level = existing.level
    } else {
      level = priorCount === 0 ? 'admin' : 'user'
      db.prepare('INSERT INTO user_privilege (user_id, level) VALUES (?, ?)').run(id, level)
    }
    db.exec('COMMIT')
    return { id, level }
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

// mirror of the api.ts last-admin demotion guard
function changeLevel(db, target, level) {
  const targetRow = db.prepare('SELECT id FROM users WHERE cwa_username = ?').get(target)
  if (!targetRow) return { code: 404, error: `Unknown account: ${target}` }
  const currentLevel =
    db.prepare("SELECT COALESCE(level, 'user') AS level FROM user_privilege WHERE user_id = ?").get(targetRow.id)?.level ?? 'user'
  if (currentLevel === 'admin' && level !== 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) AS n FROM user_privilege WHERE level = 'admin'").get().n
    if (adminCount <= 1) return { code: 409, error: 'Cannot demote the last admin' }
  }
  db.prepare(`
    INSERT INTO user_privilege (user_id, level) VALUES (?, ?)
    ON CONFLICT (user_id) DO UPDATE SET level = excluded.level
  `).run(targetRow.id, level)
  return { ok: true, username: target, level }
}

test('first-ever login is bootstrapped to admin', () => {
  const db = makePrivDb()
  const { level } = ensureUserAndPrivilege(db, 'jacob')
  assert.equal(level, 'admin')
})

test('second new account defaults to user', () => {
  const db = makePrivDb()
  ensureUserAndPrivilege(db, 'jacob')           // admin (bootstrap)
  const { level } = ensureUserAndPrivilege(db, 'partner')
  assert.equal(level, 'user')
})

test('existing account keeps its stored level on re-login', () => {
  const db = makePrivDb()
  const first = ensureUserAndPrivilege(db, 'jacob')
  assert.equal(first.level, 'admin')
  const second = ensureUserAndPrivilege(db, 'jacob')  // re-login, no new row
  assert.equal(second.level, 'admin')
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1)
})

test('none level blocks login (no cookie issued)', () => {
  const db = makePrivDb()
  ensureUserAndPrivilege(db, 'jacob')                 // admin
  const partner = ensureUserAndPrivilege(db, 'partner')
  changeLevel(db, 'partner', 'none')                  // admin disables partner
  // Re-login resolves the stored level; the handler returns 403 for 'none'.
  const { level } = ensureUserAndPrivilege(db, 'partner')
  assert.equal(level, 'none')
  const wouldIssueCookie = level !== 'none'
  assert.equal(wouldIssueCookie, false)
  assert.ok(partner) // partner row still exists
})

test('admin can change the other account level', () => {
  const db = makePrivDb()
  ensureUserAndPrivilege(db, 'jacob')         // admin
  ensureUserAndPrivilege(db, 'partner')       // user
  const r = changeLevel(db, 'partner', 'viewer')
  assert.ok(r.ok)
  assert.equal(r.level, 'viewer')
  const stored = db.prepare("SELECT level FROM user_privilege p JOIN users u ON u.id = p.user_id WHERE u.cwa_username = 'partner'").get()
  assert.equal(stored.level, 'viewer')
})

test('last-admin self-demotion is rejected', () => {
  const db = makePrivDb()
  ensureUserAndPrivilege(db, 'jacob')         // the only admin
  ensureUserAndPrivilege(db, 'partner')       // user
  const r = changeLevel(db, 'jacob', 'user')
  assert.equal(r.code, 409)
  assert.ok(/last admin/i.test(r.error))
})

test('an admin can be demoted once a second admin exists', () => {
  const db = makePrivDb()
  ensureUserAndPrivilege(db, 'jacob')         // admin
  ensureUserAndPrivilege(db, 'partner')       // user
  changeLevel(db, 'partner', 'admin')         // now two admins
  const r = changeLevel(db, 'jacob', 'user')  // safe to demote one
  assert.ok(r.ok)
  assert.equal(r.level, 'user')
})
