import type { FastifyRequest } from 'fastify'
import type { Privilege } from '../auth.js'
import type { Db } from '../db.js'

// Shape attached by authGuard (Phase 3; level added Phase 11, refreshed from
// the DB per request since the live-privilege change).
export interface JwtUser {
  sub: number
  username: string
  level?: Privilege
}

export function authedUser(req: FastifyRequest): JwtUser {
  return (req as FastifyRequest & { user: JwtUser }).user
}

// Look up (or fail fast on) a user row — users are created lazily at login
export function getUserId(db: Db, username: string): number {
  const row = db
    .prepare('SELECT id FROM users WHERE cwa_username = ?')
    .get(username) as { id: number } | undefined
  if (!row) throw new Error(`User not found in buff.db: ${username}`)
  return row.id
}
