import { defineConfig, devices } from '@playwright/test'

/**
 * Cross-browser / touch / audio-path e2e suite — run ON DEMAND, not in the
 * regular deploy pipeline. Use it before shipping a major feature:
 *
 *   npm run e2e            # builds, then runs all four engines/profiles
 *   npx playwright test --project=iphone-webkit   # just the iPhone profile
 *
 * It drives the PRODUCTION build (client/dist served by the real Fastify
 * server) against throwaway databases created in e2e/start-server.mjs.
 * WebKit here is Safari's engine, the closest to iPhone Safari a CI machine
 * gets — the hardware ringer switch and lock-screen policies still only exist
 * on a real phone, so audio assertions target the code PATH (element play,
 * context resume, wake lock), never audibility.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: false, // one shared server + one buff.db — keep runs serial
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8590',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    // Safari engine + iPhone UA/viewport/touch: the app's IS_IOS branches
    // (element-routed audio, unlock, wake lock) run for real here.
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'node e2e/start-server.mjs',
    url: 'http://127.0.0.1:8590/api/health',
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      NODE_ENV: 'production',
      PORT: '8590',
      SESSION_SECRET: 'e2e-local-secret',
      CWA_DB_PATH: 'e2e/.tmp/cwa-app.db',
      BUFF_DB_PATH: 'e2e/.tmp/buff.db',
      STATIC_DIR: 'client/dist',
    },
  },
})
