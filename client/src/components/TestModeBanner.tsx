import { useTestMode } from '../store/testMode'

/**
 * Slim banner shown on every screen while test mode is active, with a quick exit.
 * Renders nothing when test mode is off.
 */
export default function TestModeBanner() {
  const { testMode, setTestMode } = useTestMode()
  if (!testMode) return null
  return (
    <div className="test-mode-banner" role="status" aria-live="polite">
      <span>🧪 Test mode — nothing is saved</span>
      <button
        className="test-mode-banner-exit"
        onClick={() => setTestMode(false)}
        aria-label="Exit test mode"
      >
        Exit
      </button>
    </div>
  )
}
