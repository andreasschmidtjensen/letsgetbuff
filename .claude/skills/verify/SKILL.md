---
name: verify
description: Run and visually verify the letsgetbuff app locally on Windows (no CWA server needed) — production build, fixture login DB, headless-Chrome screenshots.
---

# Verifying letsgetbuff locally

`npm run dev` is NOT enough to exercise the app: the Vite dev server has no
`/api` proxy, so login fails from :5173. Run the **production build** instead.

## 1. Build

```bash
npm run build   # client (tsc + vite) + server (tsc) from repo root
```

## 2. Fixture CWA login DB

Auth reads Calibre-Web's `app.db` (`user` table: id, name, email, password with
a Werkzeug hash). Create a throwaway one — this hash is `testpassword123`
(same fixture hash as `server/src/__tests__/auth.test.mjs`):

```js
// node make-cwa-db.mjs <path>
import { DatabaseSync } from 'node:sqlite'
const db = new DatabaseSync(process.argv[2])
db.exec(`CREATE TABLE IF NOT EXISTS user (id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL, email TEXT, password TEXT NOT NULL);`)
db.prepare('INSERT OR IGNORE INTO user (name,email,password) VALUES (?,?,?)').run(
  'jacob', 'jacob@example.com',
  'pbkdf2:sha256:1000000$m9RRVon6AAusbZcV$94f11356d9a42447e9275b05f136db84d557ad15611633f6c2fa7bc94c405d33')
db.close()
```

## 3. Run the server (Git Bash syntax)

```bash
NODE_ENV=production SESSION_SECRET=verify-local-secret \
CWA_DB_PATH="<tmp>/cwa-app.db" BUFF_DB_PATH="<tmp>/buff.db" \
STATIC_DIR="<abs path to>/client/dist" PORT=8585 \
node server/dist/index.js
# check: curl http://127.0.0.1:8585/api/health  → version must match the phase
```

First account to log in becomes admin. Use a scratch BUFF_DB_PATH so real data
is never touched.

## 4. Drive it headless (Chrome extension often not connected)

`npm i puppeteer-core` in a scratch dir and point it at system Chrome
(`C:\Program Files\Google\Chrome\Application\chrome.exe`). Recipe:

- Log in: two `input`s (username/password) + first `button`.
- Seed data through the session: `page.evaluate` → `PUT /api/state` with an
  AppState `{ schemaVersion: 3, startDate, skippedWeeks: [], sessions,
  stretchSessions: {}, stretchSchedule: {enabled:true}, metrics, milestones }`;
  then `localStorage.clear()` + reload (localStorage is an offline cache that
  otherwise shadows the seed). Exercise ids for sessions:
  `dumbbell-bench-press`, `rdl` (A); `leg-press` (B).
- Switch tabs by clicking `.nav-btn` by text (Home, Workout, Stretch, History,
  Metrics, Goals, Settings).
- Responsive checkpoints: 375×667 (phone), 767 (still phone), 768+/800
  (sidebar appears), 1024+/1440 (card grids). E-ink theme: click
  `.theme-toggle`.
- dnd reorder with mouse: drag a `.drag-handle` (PointerSensor, 8px threshold);
  verify exercise card order changed.

## Gotchas

- History's lift chart defaults to Dumbbell Lunge — `page.select('select',
  'dumbbell-bench-press')` to see seeded data.
- Focus mode overlay (`.focus-overlay`) must cover the full viewport on wide
  screens (content centers at 760px) — check clicks in the sidebar area don't
  leak through while it's open.
- Kill the server when done; it holds the buff.db file lock.
