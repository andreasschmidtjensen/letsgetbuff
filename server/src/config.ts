/**
 * Server configuration from environment variables.
 * All have sensible defaults for local dev.
 */

const isDev = (process.env.NODE_ENV ?? 'development') === 'development'

// Session JWTs are signed with this secret. In dev we allow a well-known
// fallback for zero-config local runs, but refuse to start with it in
// production — signing with a public default lets anyone forge a session cookie.
function resolveSessionSecret(): string {
  const fromEnv = process.env.SESSION_SECRET
  if (fromEnv && fromEnv.trim()) return fromEnv
  if (isDev) return 'dev-secret-change-me'
  throw new Error(
    'SESSION_SECRET is not set. Refusing to start outside development with a ' +
    'known default signing secret — set SESSION_SECRET in the server environment.',
  )
}

export const config = {
  port: Number(process.env.PORT ?? 8585),
  buffDbPath: process.env.BUFF_DB_PATH ?? './buff.db',
  cwaDbPath: process.env.CWA_DB_PATH ?? '/cwa-config/app.db',
  sessionSecret: resolveSessionSecret(),
  staticDir: process.env.STATIC_DIR ?? '../client/dist',
  isDev,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  // Set COOKIE_SECURE=1 when the app is served over HTTPS (reverse proxy/TLS):
  // the session cookie then never travels over plain HTTP. Off by default
  // because the stock deployment is plain HTTP on the LAN/VPN port.
  cookieSecure: process.env.COOKIE_SECURE === '1',
  // Origins allowed to open the WebSocket (cross-site WS hijack guard). Empty
  // default = same-host only (any port), which fits the stock deployment.
  wsAllowedOrigins: (process.env.WS_ALLOWED_ORIGINS ?? '')
    .split(',').map(s => s.trim()).filter(Boolean),
} as const

export type Config = typeof config
