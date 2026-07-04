/**
 * Phase 20 item 5 — SESSION_SECRET boot guard.
 *
 * config.ts must refuse to load outside development when SESSION_SECRET is unset
 * (signing session JWTs with a public default would let anyone forge a cookie).
 * We can't just import config here — it reads process.env once at import time and
 * the module is cached — so we load it in a fresh child process per scenario.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
// Absolute paths must be passed to dynamic import() as a file:// URL (required on Windows).
const configUrl = pathToFileURL(path.join(here, '..', 'config.ts')).href

function loadConfigWith(env) {
  return spawnSync(
    process.execPath,
    ['--experimental-sqlite', '--import', 'tsx/esm', '-e', `import(${JSON.stringify(configUrl)})`],
    { env: { ...process.env, ...env }, encoding: 'utf8' },
  )
}

test('refuses to load in production without SESSION_SECRET', () => {
  const res = loadConfigWith({ NODE_ENV: 'production', SESSION_SECRET: '' })
  assert.notEqual(res.status, 0)
  assert.match(res.stderr, /SESSION_SECRET is not set/)
})

test('loads in production when SESSION_SECRET is provided', () => {
  const res = loadConfigWith({ NODE_ENV: 'production', SESSION_SECRET: 'a-real-secret' })
  assert.equal(res.status, 0)
})

test('loads in development with the well-known dev fallback', () => {
  const res = loadConfigWith({ NODE_ENV: 'development', SESSION_SECRET: '' })
  assert.equal(res.status, 0)
})
