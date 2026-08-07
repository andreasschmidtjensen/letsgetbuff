/**
 * REST API — composed from domain modules under ./api/:
 *
 *   state.ts    — per-user AppState sync, partner history, proxy input
 *   plan.ts     — shared plan + Claude exercise discovery
 *   session.ts  — training-session lifecycle + live order
 *   admin.ts    — privilege management + Anthropic key / GitHub client-id store
 *   github.ts   — GitHub device-flow connect + bug-report issue creation
 *   version.ts  — recent commits for the header version badge
 *
 * `registerApiRoutes(app, db)` remains the single entry point (index.ts and the
 * test suites depend on it).
 */

import type { FastifyInstance } from 'fastify'
import type { Db } from './db.js'
import { registerStateRoutes } from './api/state.js'
import { registerPlanRoutes } from './api/plan.js'
import { registerSessionRoutes } from './api/session.js'
import { registerAdminRoutes } from './api/admin.js'
import { registerGithubRoutes } from './api/github.js'
import { registerVersionRoutes } from './api/version.js'

export function registerApiRoutes(app: FastifyInstance, db: Db): void {
  registerStateRoutes(app, db)
  registerPlanRoutes(app, db)
  registerSessionRoutes(app, db)
  registerAdminRoutes(app, db)
  registerGithubRoutes(app, db)
  registerVersionRoutes(app)
}
