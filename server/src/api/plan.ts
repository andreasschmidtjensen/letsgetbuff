/**
 * Plan management + Claude exercise discovery (Phase 8).
 *
 *   GET  /api/plan             → current shared plan
 *   GET  /api/plan/ai-status   → { configured } — key presence only
 *   GET  /api/plan/proposals   → pending proposals
 *   POST /api/plan/propose     → ask Claude for a new exercise (stores as pending)
 *   POST /api/plan/approve/:id → validate + append to plan (bumps version)
 *   POST /api/plan/reject/:id  → mark proposal rejected
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { Plan, ExerciseDef } from '@letsgetbuff/shared'
import type { Db } from '../db.js'
import { proposeExercise, validateExerciseDef, isAiConfigured, MISSING_KEY_MESSAGE } from '../claude.js'

// Row shape for plan_proposals table
export interface PlanProposalRow {
  id: number
  workout_id: 'A' | 'B'
  request: string
  json: string
  status: 'pending' | 'approved' | 'rejected'
  proposed_at: string
  reviewed_at: string | null
}

export function registerPlanRoutes(app: FastifyInstance, db: Db): void {

  // ── GET /api/plan ───────────────────────────────────────────────────────────
  app.get('/api/plan', async (_req: FastifyRequest, reply: FastifyReply) => {
    const row = db.prepare('SELECT json, version FROM plan WHERE id = 1').get() as
      | { json: string; version: number }
      | undefined
    if (!row) return reply.code(404).send({ error: 'Plan not found' })
    const plan = JSON.parse(row.json) as Plan
    return reply.send({ plan, version: row.version })
  })

  // ── GET /api/plan/ai-status ─────────────────────────────────────────────────
  // Reports whether the server has an Anthropic key configured. No key value,
  // no network call. Lets the UI distinguish "not configured" from "call failed".
  app.get('/api/plan/ai-status', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ configured: isAiConfigured(db) })
  })

  // ── GET /api/plan/proposals ─────────────────────────────────────────────────
  app.get('/api/plan/proposals', async (req: FastifyRequest, reply: FastifyReply) => {
    const { status } = req.query as { status?: string }
    const rows = status
      ? (db.prepare('SELECT * FROM plan_proposals WHERE status = ? ORDER BY proposed_at DESC').all(status) as unknown as PlanProposalRow[])
      : (db.prepare('SELECT * FROM plan_proposals ORDER BY proposed_at DESC').all() as unknown as PlanProposalRow[])
    const proposals = rows.map(r => {
      const stored = JSON.parse(r.json)
      // Support both old format (plain ExerciseDef) and new format ({ exercise, warnings })
      const exercise: ExerciseDef = stored.exercise ?? stored
      const warnings: string[] = stored.warnings ?? []
      return { ...r, exercise, warnings }
    })
    return reply.send({ proposals })
  })

  // ── POST /api/plan/propose ──────────────────────────────────────────────────
  app.post<{ Body: { workoutId: 'A' | 'B'; request: string } }>(
    '/api/plan/propose',
    async (req: FastifyRequest<{ Body: { workoutId: 'A' | 'B'; request: string } }>, reply: FastifyReply) => {
      const { workoutId, request: userRequest } = req.body
      if (!workoutId || !userRequest?.trim()) {
        return reply.code(400).send({ error: 'workoutId and request are required' })
      }
      // Service-not-configured (503) is distinct from a failed Anthropic call (502)
      // so the cause is unambiguous in logs and the UI.
      if (!isAiConfigured(db)) {
        return reply.code(503).send({ error: MISSING_KEY_MESSAGE, configured: false })
      }
      const planRow = db.prepare('SELECT json FROM plan WHERE id = 1').get() as { json: string } | undefined
      const plan = planRow ? (JSON.parse(planRow.json) as Plan) : null
      const existingIds = plan ? plan.workouts.flatMap(w => w.exercises.map(e => e.id)) : []
      let exercise: ExerciseDef
      let warnings: string[]
      try {
        ;({ exercise, warnings } = await proposeExercise(db, workoutId, userRequest.trim(), existingIds))
      } catch (err) {
        app.log.error({ err }, '[api] Claude proposal failed')
        return reply.code(502).send({ error: String(err) })
      }
      if (existingIds.includes(exercise.id)) {
        return reply.code(409).send({ error: `Exercise id "${exercise.id}" already exists in the plan` })
      }
      const storedJson = JSON.stringify({ exercise, warnings })
      const result = db.prepare(`
        INSERT INTO plan_proposals (workout_id, request, json, status)
        VALUES (?, ?, ?, 'pending')
      `).run(workoutId, userRequest.trim(), storedJson)
      const proposal: PlanProposalRow = {
        id: Number(result.lastInsertRowid),
        workout_id: workoutId,
        request: userRequest.trim(),
        json: storedJson,
        status: 'pending',
        proposed_at: new Date().toISOString(),
        reviewed_at: null,
      }
      return reply.code(201).send({ proposal: { ...proposal, exercise, warnings } })
    },
  )

  // ── POST /api/plan/approve/:id ──────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/api/plan/approve/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const id = Number(req.params.id)
      const row = db.prepare('SELECT * FROM plan_proposals WHERE id = ?').get(id) as PlanProposalRow | undefined
      if (!row) return reply.code(404).send({ error: 'Proposal not found' })
      if (row.status !== 'pending') {
        return reply.code(409).send({ error: `Proposal is already ${row.status}` })
      }
      let exercise: ExerciseDef
      try {
        const stored = JSON.parse(row.json)
        // Handle both old format (plain ExerciseDef) and new format ({ exercise, warnings })
        const rawExercise = stored.exercise ?? stored
        ;({ exercise } = validateExerciseDef(rawExercise))
      } catch (err) {
        return reply.code(422).send({ error: `Validation failed: ${err}` })
      }
      const planRow = db.prepare('SELECT json, version FROM plan WHERE id = 1').get() as { json: string; version: number } | undefined
      if (!planRow) return reply.code(404).send({ error: 'Plan not found' })
      const plan = JSON.parse(planRow.json) as Plan
      const workout = plan.workouts.find(w => w.id === row.workout_id)
      if (!workout) return reply.code(400).send({ error: `Workout ${row.workout_id} not found in plan` })
      const existingIds = plan.workouts.flatMap(w => w.exercises.map(e => e.id))
      if (existingIds.includes(exercise.id)) {
        return reply.code(409).send({ error: `Exercise id "${exercise.id}" already exists in the plan` })
      }
      workout.exercises.push(exercise)
      const newVersion = planRow.version + 1
      plan.version = newVersion
      db.prepare('UPDATE plan SET json = ?, version = ? WHERE id = 1').run(JSON.stringify(plan), newVersion)
      db.prepare(`UPDATE plan_proposals SET status = 'approved', reviewed_at = ? WHERE id = ?`).run(new Date().toISOString(), id)
      return reply.send({ ok: true, exercise, planVersion: newVersion })
    },
  )

  // ── POST /api/plan/reject/:id ───────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/api/plan/reject/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const id = Number(req.params.id)
      const row = db.prepare('SELECT * FROM plan_proposals WHERE id = ?').get(id) as PlanProposalRow | undefined
      if (!row) return reply.code(404).send({ error: 'Proposal not found' })
      if (row.status !== 'pending') {
        return reply.code(409).send({ error: `Proposal is already ${row.status}` })
      }
      db.prepare(`UPDATE plan_proposals SET status = 'rejected', reviewed_at = ? WHERE id = ?`).run(new Date().toISOString(), id)
      return reply.send({ ok: true })
    },
  )
}
