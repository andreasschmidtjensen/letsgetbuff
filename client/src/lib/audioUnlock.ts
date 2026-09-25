/**
 * iOS audio unlocking + keep-alive (v53).
 *
 * iPhone Safari silences the timer sounds four ways, each needing its own fix:
 *
 *  1. An AudioContext created in a gesture still flips to 'suspended' (or the
 *     iOS-only 'interrupted') on screen lock, a phone call or Siri — and this
 *     app never called resume(). → `unlockAudio` resumes + plays a one-sample
 *     silent buffer (the canonical unlock) and installs auto-resume listeners
 *     (visibility/pageshow/pointerdown) for the life of the page.
 *  2. The hardware ringer switch mutes Web Audio ("ambient" channel) but NOT
 *     <audio> element playback ("playback" channel). → sounds.ts routes every
 *     timer sound through an element on iOS (see IS_IOS there).
 *  3. An <audio> element may only be play()ed programmatically (at timer end,
 *     outside any gesture) if it was played once INSIDE a gesture. →
 *     `unlockAudio` runs a muted play/pause over every cached element.
 *  4. A locked screen suspends JS entirely, so the ding fires on return at
 *     best. → `useWakeLock` keeps the screen on while a session runs.
 */

import { unlockCachedSounds, ensureRunning } from './sounds'
import { useEffect } from 'react'

// The most recent context that went through unlockAudio — what the auto-resume
// listeners revive. Views create one context each; the visible view's is last.
let lastCtx: AudioContext | null = null
let autoResumeInstalled = false

function installAutoResume(): void {
  if (autoResumeInstalled || typeof document === 'undefined') return
  autoResumeInstalled = true
  const kick = () => { void ensureRunning(lastCtx) }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick() })
  window.addEventListener('pageshow', kick)
  window.addEventListener('pointerdown', kick, { passive: true })
}

/**
 * Call inside every start-gesture (start focus / session / circuit / timer).
 * Idempotent and cheap after the first call.
 */
export function unlockAudio(ctx: AudioContext | null): void {
  if (ctx) {
    lastCtx = ctx
    void ensureRunning(ctx)
    try {
      // One silent sample through the graph marks the context user-activated.
      const buf = ctx.createBuffer(1, 1, 22050)
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(ctx.destination)
      src.start(0)
    } catch { /* not fatal — resume above is the important part */ }
  }
  unlockCachedSounds()
  installAutoResume()
}

/**
 * Hold a screen wake lock while `active` (focus mode, stretch session, home
 * circuit). Safari 16.4+/Chrome; a silent no-op elsewhere. Re-acquires when
 * the tab becomes visible again — the lock is auto-released on hide.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
    let lock: { release: () => Promise<void> } | null = null
    let disposed = false
    const acquire = async () => {
      try {
        lock = await (navigator as Navigator & { wakeLock: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } })
          .wakeLock.request('screen')
        if (disposed) await lock.release().catch(() => {})
      } catch { /* low battery or unsupported — timers still resync on return */ }
    }
    const onVisible = () => { if (!document.hidden) void acquire() }
    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release().catch(() => {})
    }
  }, [active])
}
