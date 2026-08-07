/**
 * GET /api/commits — the header version badge's hover notes.
 *
 * Covers the shape returned to the client, the in-memory cache (one upstream
 * GitHub call per window, however many callers), and the degraded paths: a
 * failing GitHub call must keep serving the last good list rather than
 * erroring, and must not blank the popover on a cold cache.
 */

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import { registerVersionRoutes, clearCommitCache, expireCommitCache } from '../api/version.js'

const COMMIT = (sha, subject) => ({
  sha,
  html_url: `https://github.com/andreasschmidtjensen/letsgetbuff/commit/${sha}`,
  commit: { message: `${subject}\n\nbody line`, author: { date: '2026-08-07T18:00:00Z' } },
})

function stubFetch(impl) {
  const calls = { count: 0 }
  globalThis.fetch = async (...args) => { calls.count++; return impl(...args) }
  return calls
}

const ok = (body) => ({ ok: true, status: 200, json: async () => body })

async function makeApp() {
  const app = Fastify({ logger: false })
  registerVersionRoutes(app)
  await app.ready()
  return app
}

beforeEach(() => clearCommitCache())

test('returns repo url and mapped commit notes', async () => {
  stubFetch(async () => ok([COMMIT('a'.repeat(40), 'Advance the program week')]))
  const app = await makeApp()

  const res = await app.inject({ method: 'GET', url: '/api/commits' })
  assert.equal(res.statusCode, 200)
  const body = res.json()

  assert.equal(body.repoUrl, 'https://github.com/andreasschmidtjensen/letsgetbuff')
  assert.equal(body.commits.length, 1)
  const c = body.commits[0]
  assert.equal(c.shortSha, 'aaaaaaa')
  // Subject only — the body after the blank line is dropped.
  assert.equal(c.subject, 'Advance the program week')
  assert.equal(c.date, '2026-08-07T18:00:00Z')
  assert.match(c.url, /\/commit\/a{40}$/)

  await app.close()
})

test('caches: a second request does not hit GitHub again', async () => {
  const calls = stubFetch(async () => ok([COMMIT('b'.repeat(40), 'Add a guest mode')]))
  const app = await makeApp()

  await app.inject({ method: 'GET', url: '/api/commits' })
  await app.inject({ method: 'GET', url: '/api/commits' })
  await app.inject({ method: 'GET', url: '/api/commits' })

  assert.equal(calls.count, 1)
  await app.close()
})

test('a GitHub failure on a cold cache returns an empty list, not a 500', async () => {
  stubFetch(async () => ({ ok: false, status: 403, json: async () => ({}) }))
  const app = await makeApp()

  const res = await app.inject({ method: 'GET', url: '/api/commits' })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.json().commits, [])

  await app.close()
})

test('a GitHub failure after a good fetch keeps serving the cached list', async () => {
  stubFetch(async () => ok([COMMIT('c'.repeat(40), 'Move bug reporting')]))
  const app = await makeApp()
  await app.inject({ method: 'GET', url: '/api/commits' })

  // Age the cache past its window, then make the refresh throw.
  expireCommitCache()
  const calls = stubFetch(async () => { throw new Error('network down') })

  const res = await app.inject({ method: 'GET', url: '/api/commits' })
  assert.equal(res.statusCode, 200)
  assert.equal(calls.count, 1, 'it did try to refresh')
  assert.equal(res.json().commits[0].subject, 'Move bug reporting', 'stale data still served')

  await app.close()
})
