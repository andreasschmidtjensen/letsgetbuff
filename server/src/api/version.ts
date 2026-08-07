/**
 * GET /api/commits — the last few commits on main, for the version badge's
 * hover notes.
 *
 * Public, like /api/health and /api/plan: the repo is public, the response
 * carries no user data, and guest mode shows the same header. Unauthenticated
 * GitHub calls are rate-limited to 60/hour per IP, so the result is cached in
 * memory and refreshed at most once every CACHE_MS — one upstream call per
 * window no matter how many clients ask. A failed refresh keeps serving the
 * last good list rather than blanking the popover.
 */

import type { FastifyInstance } from 'fastify'
import { GITHUB_REPO } from '../github.js'

export interface CommitNote {
  sha: string
  shortSha: string
  subject: string
  date: string
  url: string
}

const CACHE_MS = 10 * 60 * 1000
const COUNT = 5

let cache: { at: number; commits: CommitNote[] } | null = null

// Exposed for tests — the cache is module state, so it has to be resettable.
export function clearCommitCache(): void {
  cache = null
}

// Exposed for tests: age the cache past CACHE_MS without clearing it, so the
// "refresh fails, keep serving the last good list" path is reachable.
export function expireCommitCache(): void {
  if (cache) cache.at = 0
}

interface GithubCommit {
  sha: string
  html_url: string
  commit: { message: string; author: { date: string } }
}

async function fetchCommits(): Promise<CommitNote[]> {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/commits?per_page=${COUNT}`,
    {
      headers: {
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'letsgetbuff',
      },
    },
  )
  if (!res.ok) throw new Error(`GitHub commits: ${res.status}`)
  const body = (await res.json()) as GithubCommit[]
  return body.map(c => ({
    sha: c.sha,
    shortSha: c.sha.slice(0, 7),
    // Commit messages are subject + blank line + body; the badge only shows
    // the subject line.
    subject: c.commit.message.split('\n')[0],
    date: c.commit.author.date,
    url: c.html_url,
  }))
}

export function registerVersionRoutes(app: FastifyInstance): void {
  app.get('/api/commits', async () => {
    const fresh = cache && Date.now() - cache.at < CACHE_MS
    if (!fresh) {
      try {
        cache = { at: Date.now(), commits: await fetchCommits() }
      } catch (err) {
        app.log.warn({ err }, '[version] could not refresh commit list')
        // Keep serving stale data if we have any; otherwise an empty list, so
        // the popover degrades to just the sha rather than erroring.
        if (!cache) cache = { at: Date.now(), commits: [] }
      }
    }
    return { repoUrl: `https://github.com/${GITHUB_REPO}`, commits: cache!.commits }
  })
}
