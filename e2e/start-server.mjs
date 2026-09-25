// Playwright webServer entry: prepare the throwaway environment, then boot
// the real production server. (Playwright starts the web server BEFORE
// globalSetup runs, so the fixtures must be created here.)
//
// e2e/.tmp gets a fixture Calibre-Web `app.db` (auth reads it; the hash is
// `testpassword123`, the same fixture as the server auth tests) and a fresh
// buff.db seeds from the catalog on boot. Real data is never touched — the
// server only sees these paths (see env in playwright.config.ts).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const TMP = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp')

fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })

const db = new DatabaseSync(path.join(TMP, 'cwa-app.db'))
db.exec(`CREATE TABLE IF NOT EXISTS user (id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL, email TEXT, password TEXT NOT NULL);`)
db.prepare('INSERT OR IGNORE INTO user (name,email,password) VALUES (?,?,?)').run(
  'e2e', 'e2e@example.com',
  'pbkdf2:sha256:1000000$m9RRVon6AAusbZcV$94f11356d9a42447e9275b05f136db84d557ad15611633f6c2fa7bc94c405d33')
db.close()

await import('../server/dist/index.js')
