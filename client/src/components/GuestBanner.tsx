/**
 * Always-visible reminder that this is a guest session: everything works, but
 * nothing is stored. "Exit" drops back to the login screen (and discards the
 * in-memory demo state with it). Reuses the test-mode banner's layout — the
 * desktop grid gives that class its own row.
 */
export default function GuestBanner({ onExit }: { onExit: () => void }) {
  return (
    <div className="test-mode-banner guest-banner" role="status" aria-live="polite">
      <span>👤 Guest mode — nothing is saved</span>
      <button
        className="test-mode-banner-exit"
        onClick={onExit}
        aria-label="Exit guest mode"
      >
        Sign in
      </button>
    </div>
  )
}
