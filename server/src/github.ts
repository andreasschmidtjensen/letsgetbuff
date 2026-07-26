/**
 * GitHub integration — OAuth Device Flow + issue creation (bug reporting).
 *
 * Each user authorizes once via the device flow (no callback URL, no client
 * secret — only the OAuth App client ID, which an admin stores in
 * server_config). The granted token (scope: public_repo, the narrowest classic
 * scope that can create issues on a public repo) is stored per user in
 * github_tokens and used to file issues as that user.
 */

import type { Db } from './db.js'

/** Issues land here — the repo this app is developed and deployed from. */
export const GITHUB_REPO = 'andreasschmidtjensen/letsgetbuff'

/** Actionable message shown when the GitHub client ID is missing. */
export const MISSING_CLIENT_ID_MESSAGE =
  'GitHub client ID not configured. An admin can add it in Settings.'

// GitHub's REST API rejects requests without a User-Agent; Node's fetch sends
// one, but be explicit so the requirement is visible here.
const API_HEADERS = (token: string) => ({
  authorization: `Bearer ${token}`,
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
  'user-agent': 'letsgetbuff',
})

// ---------------------------------------------------------------------------
// Configuration (client ID lives in server_config, admin-editable)
// ---------------------------------------------------------------------------

export function getGithubClientId(db: Db): string {
  try {
    const row = db.prepare(
      "SELECT value FROM server_config WHERE key = 'github_client_id'"
    ).get() as { value: string } | undefined
    return row?.value ?? ''
  } catch { /* table not yet migrated */ }
  return ''
}

export function isGithubConfigured(db: Db): boolean {
  return Boolean(getGithubClientId(db))
}

// ---------------------------------------------------------------------------
// Per-user token store
// ---------------------------------------------------------------------------

export interface GithubTokenRow {
  token: string
  github_login: string | null
}

export function getToken(db: Db, userId: number): GithubTokenRow | undefined {
  return db.prepare(
    'SELECT token, github_login FROM github_tokens WHERE user_id = ?'
  ).get(userId) as GithubTokenRow | undefined
}

export function saveToken(db: Db, userId: number, token: string, githubLogin: string | null): void {
  db.prepare(`
    INSERT INTO github_tokens (user_id, token, github_login, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET
      token = excluded.token,
      github_login = excluded.github_login,
      created_at = excluded.created_at
  `).run(userId, token, githubLogin, new Date().toISOString())
}

export function deleteToken(db: Db, userId: number): void {
  db.prepare('DELETE FROM github_tokens WHERE user_id = ?').run(userId)
}

// ---------------------------------------------------------------------------
// Device flow (https://docs.github.com/apps/oauth-apps → device flow)
// ---------------------------------------------------------------------------

export interface DeviceFlowStart {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

export async function startDeviceFlow(clientId: string): Promise<DeviceFlowStart> {
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, scope: 'public_repo' }),
  })
  const json = await res.json() as DeviceFlowStart & { error?: string; error_description?: string }
  if (!res.ok || json.error || !json.device_code) {
    throw new Error(`GitHub device-flow start failed: ${json.error_description ?? json.error ?? res.status}`)
  }
  return json
}

export async function pollDeviceFlow(clientId: string, deviceCode: string): Promise<Record<string, unknown>> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  })
  return await res.json() as Record<string, unknown>
}

export type PollStatus =
  | { status: 'pending' }
  | { status: 'slow_down'; interval: number }
  | { status: 'expired' }
  | { status: 'denied' }
  | { status: 'connected'; token: string }

/**
 * Map GitHub's token-endpoint response to a flow status. Expected flow states
 * come back as objects; anything unrecognised throws (route maps it to 502).
 */
export function mapPollResponse(json: Record<string, unknown>): PollStatus {
  if (typeof json.access_token === 'string') return { status: 'connected', token: json.access_token }
  switch (json.error) {
    case 'authorization_pending': return { status: 'pending' }
    case 'slow_down': return { status: 'slow_down', interval: Number(json.interval) || 10 }
    case 'expired_token': return { status: 'expired' }
    case 'access_denied': return { status: 'denied' }
    default:
      throw new Error(`GitHub device-flow poll failed: ${json.error_description ?? json.error ?? 'unknown response'}`)
  }
}

// ---------------------------------------------------------------------------
// GitHub REST API calls
// ---------------------------------------------------------------------------

export async function fetchGithubLogin(token: string): Promise<string> {
  const res = await fetch('https://api.github.com/user', { headers: API_HEADERS(token) })
  if (!res.ok) throw new Error(`GET /user failed: ${res.status}`)
  const json = await res.json() as { login?: string }
  if (!json.login) throw new Error('GET /user returned no login')
  return json.login
}

export interface IssueMeta {
  username: string
  githubLogin: string | null
  appVersion: number
  userAgent: string
}

/** Issue body = the user's description + a metadata footer for triage. */
export function buildIssueBody(description: string, meta: IssueMeta): string {
  const login = meta.githubLogin ? ` (@${meta.githubLogin})` : ''
  return [
    description.trim() || '_No description provided._',
    '',
    '---',
    `Reported from GYMN by **${meta.username}**${login}`,
    `App version: ${meta.appVersion}`,
    `User agent: ${meta.userAgent}`,
    `Date: ${new Date().toISOString()}`,
  ].join('\n')
}

/** Thrown by createIssue so routes can distinguish a revoked token (401). */
export class GithubApiError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message)
  }
}

export async function createIssue(
  token: string, title: string, body: string,
): Promise<{ url: string; number: number }> {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
    method: 'POST',
    headers: { ...API_HEADERS(token), 'content-type': 'application/json' },
    body: JSON.stringify({ title, body }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new GithubApiError(`GitHub issue creation failed: ${res.status} ${text.slice(0, 200)}`, res.status)
  }
  const json = await res.json() as { html_url: string; number: number }
  return { url: json.html_url, number: json.number }
}
