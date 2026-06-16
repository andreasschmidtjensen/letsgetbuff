# CLAUDE.md — Let's Get Buff (GYMN)

Context for every session. "GYMN" is a product/folder label only; internal package/file/DB
names stay `letsgetbuff` / `buff.db` — no rename pass.

## What this is
A two-user, server-backed workout tracker with **live shared exercise reordering** over
WebSocket during joint workouts. React + Vite + TS front end, Fastify + SQLite backend,
self-hosted in one Docker container on a Debian VPS. Exactly two users, one shared plan,
separate per-user logs.

## Repo layout (npm-workspaces monorepo)
- `client/` — Vite React app. `src/engine` = pure logic (schedule, progression, REUSED
  unchanged), `src/catalog` = plan-as-data seed, `src/store` = server-sync + offline cache,
  `src/views`.
- `server/` — Fastify app. `index.ts` (bootstrap, static serving, `/api/health`),
  `auth.ts` (CWA login), `db.ts` (schema + migrations), `api.ts` (REST data sync + plan),
  `ws.ts` (live reorder + presence), `claude.ts` (AI exercise discovery), `backup.ts`.
- `shared/` — types + engine/catalog importable by both client and server.
- `Dockerfile`, `docker-compose.yml`, `.github/workflows/deploy.yml`.

## Stack
Node 22+ using the **built-in `node:sqlite`** (processes run with `--experimental-sqlite`),
TypeScript, Fastify 5, `ws`, dnd-kit (drag), React + Vite, `@anthropic-ai/sdk` (server-side
only). One container serves the static client build + API + WS on **port 8585**.

## Commands (from repo root)
- `npm run dev` — client + server together (live reload).
- `npm run build` — builds client + server (the Docker build also compiles `shared` first).
- `npm start` — production server (`node --experimental-sqlite server/dist/index.js`).
- `npm test` — client + shared tests. Server tests: `npm test -w server`.

## Hard invariants (must hold in every change)
- **JSON export/import must never break.** Old backup files always import — migrated through
  the schema-version ladder, never rejected. The `AppState` JSON (schemaVersion, startDate,
  skippedWeeks, sessions, metrics, milestones) is a stable public contract. Internal storage
  may change only via adapter functions (`fromBackupJSON` / `toBackupJSON`), never by changing
  the file format. Any phase touching state/persistence must verify a real old backup
  round-trips (export → import → identical effective state).
- **CWA auth is read-only.** Credentials verified against Calibre-Web Automated's `app.db`
  `user` table (Werkzeug `scrypt:` / `pbkdf2:sha256:` — detect by prefix). The app never stores
  passwords; it issues its own HttpOnly, SameSite JWT cookie. Privilege levels live in
  `buff.db` (`user_privilege`), never in CWA.
- **Bump `/api/health` `version` every phase** — it's how you confirm what's deployed.

## Data model (buff.db — separate from CWA's app.db)
`users`, `app_state` (per-user AppState blob), `plan` (single shared row, seeded from catalog),
`live_order` (session-scoped order + monotonic `version` for last-write-wins), `plan_proposals`
(Claude discovery), `user_privilege`. Presence is in-memory only. Client `localStorage` is an
offline cache + outbound mutation queue, not the system of record.

## Deployment — ALREADY SET UP, don't rebuild it
- **Push to `main`** → GitHub Actions (`.github/workflows/deploy.yml`) builds the Docker image,
  pushes it to `ghcr.io/andreasschmidtjensen/letsgetbuff`, then SSHes into the VPS and runs
  `git pull` + `docker compose pull` + `docker compose up -d`. **The server never builds** — it
  only pulls the prebuilt image.
- Server: Debian VPS, app dir `/opt/letsgetbuff`, container `letsgetbuff` on port 8585, running
  alongside Calibre-Web Automated. The `.env` (SESSION_SECRET, ANTHROPIC_API_KEY) lives **only**
  on the server — never commit it (`.gitignore` enforces this).
- **Rollback:** `git revert <bad-commit> && git push` redeploys the previous version.
- **Verify a deploy:** on the server, `curl http://127.0.0.1:8585/api/health` — `version` should
  match the phase you just shipped.

## Build plan & working style
Phased rebuild. **Per-session protocol: read `build-plan/00-MASTER-BRIEF.md` + the one relevant
`build-plan/PHASE-N-*.md`, implement that phase only, keep context small.** Feature backlog in
`feature-backlog.md`. Phases 1–9 are complete (their notes are appended into the master brief);
phases 10–17 are the backlog (fix AI key, privilege levels, session model, session-start UI,
timer/sound, rest timer, proxy input, history charts). Use plan mode (Shift+Tab) before large
multi-file changes.

## Environment note
Phases 1–9 were built inside a sandboxed, OneDrive-mounted environment that needed FUSE /
`shutil.copy2` write workarounds and had esbuild/node_modules quirks. **None of that applies in
Claude Code running natively on your machine** — write files directly and use normal
`npm install`. Ignore any FUSE/OneDrive workaround instructions left in the phase notes.
