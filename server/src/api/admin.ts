/**
 * Admin-only routes: user privilege management (Phase 11) and the Anthropic
 * API key store (Phase 18). All guarded by requirePrivilege('admin').
 *
 *   GET    /api/admin/users
 *   PUT    /api/admin/users/:username/level
 *   GET    /api/admin/config/ai-key
 *   PUT    /api/admin/config/ai-key
 *   DELETE /api/admin/config/ai-key
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { Db } from '../db.js'
import { isAiConfigured, getApiKey } from '../claude.js'
import { requirePrivilege, type Privilege } from '../auth.js'

const VALID_LEVELS: Privilege[] = ['none', 'viewer', 'user', 'admin']

export function registerAdminRoutes(app: FastifyInstance, db: Db): void {

  // GET /api/admin/users → all accounts with their level + created_at
  app.get(
    '/api/admin/users',
    { preHandler: requirePrivilege('admin') },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const rows = db.prepare(`
        SELECT u.cwa_username AS username,
               COALESCE(p.level, 'user') AS level,
               u.created_at AS createdAt
        FROM users u
        LEFT JOIN user_privilege p ON p.user_id = u.id
        ORDER BY u.created_at ASC
      `).all() as { username: string; level: Privilege; createdAt: string }[]
      return reply.send({ users: rows })
    },
  )

  // PUT /api/admin/users/:username/level → change an account's level
  app.put<{ Params: { username: string }; Body: { level: Privilege } }>(
    '/api/admin/users/:username/level',
    {
      preHandler: requirePrivilege('admin'),
      schema: {
        body: {
          type: 'object',
          required: ['level'],
          properties: { level: { type: 'string', enum: VALID_LEVELS } },
        },
      },
    },
    async (req: FastifyRequest<{ Params: { username: string }; Body: { level: Privilege } }>, reply: FastifyReply) => {
      const { username: target } = req.params
      const { level } = req.body
      if (!VALID_LEVELS.includes(level)) {
        return reply.code(400).send({ error: `Invalid level: ${level}` })
      }
      const targetRow = db
        .prepare('SELECT id FROM users WHERE cwa_username = ?')
        .get(target) as { id: number } | undefined
      if (!targetRow) return reply.code(404).send({ error: `Unknown account: ${target}` })

      const currentLevel = (
        db.prepare("SELECT COALESCE(level, 'user') AS level FROM user_privilege WHERE user_id = ?").get(targetRow.id) as
          | { level: Privilege }
          | undefined
      )?.level ?? 'user'

      // Prevent removing the last admin (self-lockout guard).
      if (currentLevel === 'admin' && level !== 'admin') {
        const adminCount = (
          db.prepare("SELECT COUNT(*) AS n FROM user_privilege WHERE level = 'admin'").get() as { n: number }
        ).n
        if (adminCount <= 1) {
          return reply.code(409).send({ error: 'Cannot demote the last admin' })
        }
      }

      const now = new Date().toISOString()
      db.prepare(`
        INSERT INTO user_privilege (user_id, level, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT (user_id) DO UPDATE SET level = excluded.level, updated_at = excluded.updated_at
      `).run(targetRow.id, level, now)

      return reply.send({ ok: true, username: target, level })
    },
  )

  // ── Phase 18: Anthropic API key management ──────────────────────────────────

  // GET /api/admin/config/ai-key → { configured: bool } — never returns the key value
  app.get(
    '/api/admin/config/ai-key',
    { preHandler: requirePrivilege('admin') },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ configured: isAiConfigured(db) })
    },
  )

  // PUT /api/admin/config/ai-key — upsert the key into server_config
  app.put<{ Body: { key: string } }>(
    '/api/admin/config/ai-key',
    {
      preHandler: requirePrivilege('admin'),
      schema: {
        body: {
          type: 'object',
          required: ['key'],
          properties: { key: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (req: FastifyRequest<{ Body: { key: string } }>, reply: FastifyReply) => {
      const { key } = req.body
      if (!key?.trim()) return reply.code(400).send({ error: 'key is required' })
      const now = new Date().toISOString()
      db.prepare(`
        INSERT INTO server_config (key, value, updated_at)
        VALUES ('anthropic_api_key', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run(key.trim(), now)
      return reply.send({ ok: true })
    },
  )

  // DELETE /api/admin/config/ai-key — remove DB key; env-var fallback may still apply
  app.delete(
    '/api/admin/config/ai-key',
    { preHandler: requirePrivilege('admin') },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      db.prepare("DELETE FROM server_config WHERE key = 'anthropic_api_key'").run()
      return reply.send({ ok: true, configured: Boolean(getApiKey(db)) })
    },
  )
}
