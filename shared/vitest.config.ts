import { defineConfig } from "vitest/config"

// Pin a non-UTC timezone so the civil-date helpers (lib/date) are exercised
// under the same conditions as the client suite — this is what proves dateKey
// uses the LOCAL day, not the UTC day. Mirrors client/vite.config.ts.
export default defineConfig(() => {
  if (process.env.VITEST) process.env.TZ = "America/New_York"
  return {
    test: { environment: "node" },
  }
})
