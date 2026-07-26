/**
 * GitHub bug reporting — device-flow + issue logic tests.
 *
 * Fully self-contained: no TypeScript imports, no Fastify — the same pattern
 * as plan.test.mjs. The pure functions below are inline mirrors of
 * server/src/github.ts; keep them in sync.
 *
 * Covers:
 *  1. Token save → read round-trip
 *  2. Token upsert replaces an existing row (PK on user_id)
 *  3. Token delete removes the row; deleting a missing row is a no-op
 *  4. mapPollResponse: authorization_pending → pending
 *  5. mapPollResponse: slow_down carries the new interval
 *  6. mapPollResponse: expired_token / access_denied → expired / denied
 *  7. mapPollResponse: access_token → connected with token
 *  8. mapPollResponse: unknown error → throws (route maps to 502)
 *  9. buildIssueBody includes description + metadata footer
 * 10. buildIssueBody handles empty description and missing github_login
 * 11. Revoked token (GitHub 401) → stored row deleted
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'

// ---------------------------------------------------------------------------
// Schema under test (mirrors db.ts migration 8, plus the users table it refs)
// ---------------------------------------------------------------------------

function makeDb() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      cwa_username TEXT UNIQUE NOT NULL
    );
    CREATE TABLE github_tokens (
      user_id      INTEGER PRIMARY KEY REFERENCES users(id),
      token        TEXT NOT NULL,
      github_login TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  db.prepare("INSERT INTO users (cwa_username) VALUES ('jacob')").run()
  return db
}

// ---------------------------------------------------------------------------
// Inline mirrors of server/src/github.ts token CRUD
// ---------------------------------------------------------------------------

function getToken(db, userId) {
  return db.prepare('SELECT token, github_login FROM github_tokens WHERE user_id = ?').get(userId)
}

function saveToken(db, userId, token, githubLogin) {
  db.prepare(`
    INSERT INTO github_tokens (user_id, token, github_login, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET
      token = excluded.token,
      github_login = excluded.github_login,
      created_at = excluded.created_at
  `).run(userId, token, githubLogin, new Date().toISOString())
}

function deleteToken(db, userId) {
  db.prepare('DELETE FROM github_tokens WHERE user_id = ?').run(userId)
}

// ---------------------------------------------------------------------------
// Inline mirror of mapPollResponse
// ---------------------------------------------------------------------------

function mapPollResponse(json) {
  if (typeof json.access_token === 'string') return { status: 'connected', token: json.access_token }
  switch (json.error) {
    case 'authorization_pending': return { status: 'pending' }
    case 'slow_down': return { status: 'slow_down', interval: Number(json.interval) || 10 }
    case 'expired_token': return { status: 'expired' }
    case 'access_denied': return { status: 'denied' }
    default:
      throw new Error(`GitHub device-flow poll failed: ${json.error_description ?? json.error ?? 'unknown response'}`)
  }
}

// ---------------------------------------------------------------------------
// Inline mirror of buildIssueBody
// ---------------------------------------------------------------------------

function buildIssueBody(description, meta) {
  const login = meta.githubLogin ? ` (@${meta.githubLogin})` : ''
  return [
    description.trim() || '_No description provided._',
    '',
    '---',
    `Reported from GYMN by **${meta.username}**${login}`,
    `App version: ${meta.appVersion}`,
    `User agent: ${meta.userAgent}`,
    `Date: ${new Date().toISOString()}`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// 1–3: token store
// ---------------------------------------------------------------------------

test('token save → read round-trip', () => {
  const db = makeDb()
  saveToken(db, 1, 'gho_abc', 'jacob-gh')
  const row = getToken(db, 1)
  assert.equal(row.token, 'gho_abc')
  assert.equal(row.github_login, 'jacob-gh')
})

test('token upsert replaces the existing row', () => {
  const db = makeDb()
  saveToken(db, 1, 'gho_old', 'old-login')
  saveToken(db, 1, 'gho_new', 'new-login')
  const row = getToken(db, 1)
  assert.equal(row.token, 'gho_new')
  assert.equal(row.github_login, 'new-login')
  const count = db.prepare('SELECT COUNT(*) AS n FROM github_tokens').get()
  assert.equal(count.n, 1)
})

test('token delete removes the row; deleting again is a no-op', () => {
  const db = makeDb()
  saveToken(db, 1, 'gho_abc', null)
  deleteToken(db, 1)
  assert.equal(getToken(db, 1), undefined)
  assert.doesNotThrow(() => deleteToken(db, 1))
})

// ---------------------------------------------------------------------------
// 4–8: mapPollResponse
// ---------------------------------------------------------------------------

test('authorization_pending → pending', () => {
  assert.deepEqual(mapPollResponse({ error: 'authorization_pending' }), { status: 'pending' })
})

test('slow_down carries the new interval (with fallback)', () => {
  assert.deepEqual(mapPollResponse({ error: 'slow_down', interval: 12 }), { status: 'slow_down', interval: 12 })
  assert.deepEqual(mapPollResponse({ error: 'slow_down' }), { status: 'slow_down', interval: 10 })
})

test('expired_token / access_denied → expired / denied', () => {
  assert.deepEqual(mapPollResponse({ error: 'expired_token' }), { status: 'expired' })
  assert.deepEqual(mapPollResponse({ error: 'access_denied' }), { status: 'denied' })
})

test('access_token → connected with the token', () => {
  assert.deepEqual(
    mapPollResponse({ access_token: 'gho_xyz', token_type: 'bearer', scope: 'public_repo' }),
    { status: 'connected', token: 'gho_xyz' },
  )
})

test('unknown error → throws (route maps to 502)', () => {
  assert.throws(
    () => mapPollResponse({ error: 'incorrect_client_credentials', error_description: 'bad client_id' }),
    /bad client_id/,
  )
  assert.throws(() => mapPollResponse({}), /unknown response/)
})

// ---------------------------------------------------------------------------
// 9–10: buildIssueBody
// ---------------------------------------------------------------------------

test('buildIssueBody includes description and metadata footer', () => {
  const body = buildIssueBody('The rest timer keeps running.', {
    username: 'jacob', githubLogin: 'jacob-gh', appVersion: 38, userAgent: 'Mozilla/5.0 test',
  })
  assert.ok(body.startsWith('The rest timer keeps running.'))
  assert.ok(body.includes('---'))
  assert.ok(body.includes('**jacob** (@jacob-gh)'))
  assert.ok(body.includes('App version: 38'))
  assert.ok(body.includes('User agent: Mozilla/5.0 test'))
})

test('buildIssueBody handles empty description and missing login', () => {
  const body = buildIssueBody('   ', {
    username: 'jacob', githubLogin: null, appVersion: 38, userAgent: 'ua',
  })
  assert.ok(body.includes('_No description provided._'))
  assert.ok(body.includes('**jacob**\n'))
  assert.ok(!body.includes('(@'))
})

// ---------------------------------------------------------------------------
// 11: revocation (mirrors the 401 branch of POST /api/github/issue)
// ---------------------------------------------------------------------------

test('revoked token (GitHub 401) → stored row deleted', () => {
  const db = makeDb()
  saveToken(db, 1, 'gho_revoked', 'jacob-gh')

  // Simulated route logic: a 401 from the issue call drops the token.
  const githubStatus = 401
  if (githubStatus === 401) deleteToken(db, 1)

  assert.equal(getToken(db, 1), undefined)
})
