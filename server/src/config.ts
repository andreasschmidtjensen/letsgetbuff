/**
 * Server configuration from environment variables.
 * All have sensible defaults for local dev.
 */

export const config = {
  port: Number(process.env.PORT ?? 8585),
  buffDbPath: process.env.BUFF_DB_PATH ?? './buff.db',
  cwaDbPath: process.env.CWA_DB_PATH ?? '/cwa-config/app.db',
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-secret-change-me',
  staticDir: process.env.STATIC_DIR ?? '../client/dist',
  isDev: (process.env.NODE_ENV ?? 'development') === 'development',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
} as const

export type Config = typeof config
