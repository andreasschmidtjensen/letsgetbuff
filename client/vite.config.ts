import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"
import { execSync } from "child_process"
import { VitePWA } from "vite-plugin-pwa"

// The commit this bundle was built from. In CI the deploy workflow passes
// ${{ github.sha }} through as a Docker build-arg (the image has no .git), so
// that wins; a local build falls back to asking git; anything else is 'dev'.
// Baked in with `define` so the running client can compare itself against the
// server's sha from /api/health and spot a stale service-worker cache.
function buildSha(): string {
  if (process.env.GIT_SHA) return process.env.GIT_SHA
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString().trim()
  } catch {
    return "dev"
  }
}

export default defineConfig(() => {
  if (process.env.VITEST) process.env.TZ = "America/New_York"
  return {
    define: {
      __GIT_SHA__: JSON.stringify(process.env.VITEST ? "dev" : buildSha()),
    },
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: "auto",
        workbox: {
          // Cache the app shell and static assets
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,mp3}"],
          // Network-first for API calls so data is always fresh when online
          runtimeCaching: [
            {
              urlPattern: /^\/api\//,
              handler: "NetworkOnly",
            },
          ],
        },
        manifest: {
          name: "Let's Get Buff",
          short_name: "Buff",
          description: "Two-user workout tracker",
          theme_color: "#0f0f0f",
          background_color: "#0f0f0f",
          display: "standalone",
          orientation: "any",
          start_url: "/",
          icons: [
            {
              src: "icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any maskable",
            },
            {
              src: "icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any maskable",
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        "@letsgetbuff/shared": path.resolve(__dirname, "../shared/src/index.ts"),
      },
    },
    test: { environment: "jsdom" },
  }
})
