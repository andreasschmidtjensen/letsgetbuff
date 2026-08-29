/**
 * The ⚡ New / Classic chip. Lives in the workout overview header so the switch
 * is reachable on the gym floor without going to Settings. Flipping it only
 * re-renders — it never ends the session or navigates.
 */

import { useUiVersion } from '../../../store/uiVersion'

export default function UiVersionChip() {
  const { v2, setV2 } = useUiVersion()
  return (
    <button
      className={`btn btn-sm ${v2 ? 'btn-primary' : 'btn-secondary'}`}
      onClick={() => setV2(!v2)}
      aria-pressed={v2}
      title={v2 ? 'Switch to the classic workout screens' : 'Try the new workout screens'}
    >
      {v2 ? '⚡ New' : 'Classic'}
    </button>
  )
}
