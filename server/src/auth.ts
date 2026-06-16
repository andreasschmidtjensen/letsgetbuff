/**
 * Phase 3 — Auth via Calibre-Web Automated's app.db
 *
 * Reads CWA's `app.db` in READ-ONLY mode.
 * Verifies passwords using Werkzeug's generate_password_hash format:
 *   pbkdf2:sha256:<iterations>$<salt>$<hex-hash>   (most installs)
 *   scrypt:<N>:<r>:<p>$<salt>$<hex-hash>            (Werkzeug >= 2.0)
 *
 * Both algorithms are handled with Node's built-in `crypto` module.
 * Never stores or caches credentials.
 */

import { createHash, pbkdf2Sync, scryptSync, timingSafeEqual } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { config } from './config.js'
import type { Db } from './db.js'

// ── Werkzeug hash verification ──────────────────────────────────────────────

/**
 * Verify a plaintext password against a Werkzeug-generated hash.
 *
 * pbkdf2 format: `pbkdf2:sha256:<iterations>$<salt>$<hex-hash>`
 * scrypt format:  `scrypt:<N>:<r>:<p>$<salt>$<hex-hash>`
 *
 * The salt is a plain UTF-8 string (not hex-encoded).
 * The stored hash is lowercase hex.
 */
export function verifyWerkzeugHash(storedHash: string, password: string): boolean {
  try {
    const dollarIdx = storedHash.indexOf('$')
    if (dollarIdx === -1) return false

    const method = storedHash.slice(0, dollarIdx)
    const rest = storedHash.slice(dollarIdx + 1)
    const secondDollar = rest.indexOf('$')
    if (secondDollar === -1) return false

    const salt = rest.slice(0, secondDollar)
    const expected = rest.slice(secondDollar + 1)

    let computed: string

    if (method.startsWith('pbkdf2:')) {
      // pbkdf2:sha256:<iterations>
      const parts = method.split(':')
      if (parts.length !== 3) return false
      const hashName = parts[1]   // e.g. 'sha256'
      const iterations = parseInt(parts[2], 10)
      if (isNaN(iterations) || iterations < 1) return false

      // Werkzeug uses digest size as keylen: sha256 → 32 bytes
      const keylen = createHash(hashName).digest().length
      const derived = pbkdf2Sync(password, salt, iterations, keylen, hashName)
      computed = derived.toString('hex')

    } else if (method.startsWith('scrypt:')) {
      // scrypt:<N>:<r>:<p>
      const parts = method.split(':')
      if (parts.length !== 4) return false
      const N = parseInt(parts[1], 10)
      const r = parseInt(parts[2], 10)
      const p = parseInt(parts[3], 10)
      if ([N, r, p].some(n => isNaN(n) || n < 1)) return false

      // dklen: read from stored hash length (same as CWA-web-tools approach)
      const keylen = Buffer.from(expected, 'hex').length
      // maxmem: 128*N*r*p required + 1 MB headroom (mirrors CWA-web-tools)
      const maxmem = 128 * N * r * p + 1024 * 1024
      const derived = scryptSync(password, salt, keylen, { N, r, p, maxmem })
      computed = derived.toString('hex')

    } else {
      return false
    }

    // Constant-time comparison
    const computedBuf = Buffer.from(computed, 'hex')
    const expectedBuf = Buffer.from(expected, 'hex')
    if (computedBuf.length !== expectedBuf.length) return false
    return timingSafeEqual(computedBuf, expectedBuf)

  } catch {
    return false
  }
}

// ── CWA database (read-only) ────────────────────────────────────────────────

let _cwaDb: DatabaseSync | null = null

export function openCwaDb(): DatabaseSync {
  if (_cwaDb) return _cwaDb
  _cwaDb = new DatabaseSync(config.cwaDbPath, { readOnly: true })
  console.log('[auth] CWA db opened read-only at', config.cwaDbPath)
  return _cwaDb
}

export function closeCwaDb(): void {
  if (_cwaDb) {
    _cwaDb.close()
    _cwaDb = null
  }
}

interface CwaUserRow {
  id: number
  name: string
  password: string
}

function lookupCwaUser(login: string): CwaUserRow | null {
  const db = openCwaDb()
  // Try username first, then email — mirrors CWA-web-tools auth.py behaviour
  const byName = db
    .prepare('SELECT id, name, password FROM user WHERE lower(name) = lower(?) LIMIT 1')
    .get(login) as CwaUserRow | undefined
  if (byName) return byName
  const byEmail = db
    .prepare('SELECT id, name, password FROM user WHERE lower(email) = lower(?) LIMIT 1')
    .get(login) as CwaUserRow | undefined
  return byEmail ?? null
}

// ── Route handlers ──────────────────────────────────────────────────────────

interface LoginBody {
  username: string
  password: string
}

export async function loginHandler(
  this: FastifyInstance,
  req: FastifyRequest<{ Body: LoginBody }>,
  reply: FastifyReply,
  buffDb: Db,
): Promise<void> {
  const { username, password } = req.body ?? {}

  if (!username || !password) {
    return reply.code(400).send({ error: 'username and password required' })
  }

  const cwaUser = lookupCwaUser(username)
  if (!cwaUser || !verifyWerkzeugHash(cwaUser.password, password)) {
    return reply.code(401).send({ error: 'Invalid credentials' })
  }

  // Lazily upsert into local users table
  buffDb
    .prepare(
      `INSERT INTO users (cwa_username) VALUES (?)
       ON CONFLICT(cwa_username) DO NOTHING`,
    )
    .run(cwaUser.name)

  const localUser = buffDb
    .prepare('SELECT id FROM users WHERE cwa_username = ?')
    .get(cwaUser.name) as { id: number }

  // Sign JWT and set HttpOnly, SameSite=Lax cookie
  const token = (this as any).jwt.sign(
    { sub: localUser.id, username: cwaUser.name },
    { expiresIn: '30d' },
  )

  reply
    .setCookie('session', token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
    })
    .send({ ok: true, username: cwaUser.name })
}

export async function logoutHandler(
  _req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  reply.clearCookie('session', { path: '/' }).send({ ok: true })
}

export async function meHandler(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // @ts-ignore — user is attached by verifyJWT preHandler
  const user = req.user as { sub: number; username: string } | undefined
  if (!user) return reply.code(401).send({ error: 'Not authenticated' })
  reply.send({ id: user.sub, username: user.username })
}

// ── Auth preHandler (guards /api/* except public routes) ───────────────────

const PUBLIC_ROUTES = new Set(['/api/login', '/api/health'])

export async function authGuard(
  this: FastifyInstance,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const path = req.url.split('?')[0]
  // Only protect API routes — static assets must load unauthenticated so the
  // React app can render its own login screen.
  if (!path.startsWith('/api/')) return
  if (PUBLIC_ROUTES.has(path)) return

  const token = req.cookies?.session
  if (!token) return reply.code(401).send({ error: 'Not authenticated' })

  try {
    const payload = (this as any).jwt.verify(token)
    ;(req as any).user = payload
  } catch {
    return reply.code(401).send({ error: 'Session expired' })
  }
}
