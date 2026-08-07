/**
 * Build identity — served by /api/health and stamped into GitHub bug-report
 * issues.
 *
 * APP_VERSION is the human-facing release number (bump every phase, per
 * CLAUDE.md). GIT_SHA is the commit the running image was built from: it is the
 * only value that can tell a stale cached client from a fresh one, because the
 * client bakes its own copy in at build time and compares the two.
 *
 * The image never contains a .git directory, so the sha arrives as a Docker
 * build-arg fed by ${{ github.sha }} in the deploy workflow. Local runs fall
 * back to 'dev'.
 */
export const APP_VERSION = 43

export const GIT_SHA = process.env.GIT_SHA || 'dev'

export const SHORT_SHA = GIT_SHA === 'dev' ? 'dev' : GIT_SHA.slice(0, 7)
