import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig(() => {
  if (process.env.VITEST) process.env.TZ = "America/New_York"
  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: "auto",
        workbox: {
          // Cache the app shell and static assets
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
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
          orientation: "portrait",
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
