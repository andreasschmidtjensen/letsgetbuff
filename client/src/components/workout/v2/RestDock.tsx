import { useEinkMode } from '../../../store/einkMode'
import { clock } from './helpers'
import { TOGETHER_KEY, type LaneView } from './useRestLanes'

/**
 * The rest dock — the core of v2. Rest stops being a modal that blocks the
 * phone and becomes a strip above the bottom nav with one lane per person, so
 * two people taking turns each get their own countdown and can still see (and
 * log) everything else.
 *
 * The dock exists only while a lane is running, and the body shrinks around it
 * rather than being covered.
 */

interface RestDockProps {
  lanes: LaneView[]
  /** Which lane the ±15s / Pause / Skip row acts on. */
  targetKey: string | null
  onTarget: (key: string) => void
  youName: string
  /** Solo sessions get one unlabelled lane — there is no one to tell apart. */
  showNames?: boolean
  onAdjust: (key: string, delta: number) => void
  onTogglePause: (key: string) => void
  onSkip: (key: string) => void
}

export default function RestDock({ lanes, targetKey, onTarget, youName, showNames = true, onAdjust, onTogglePause, onSkip }: RestDockProps) {
  const { einkMode } = useEinkMode()
  if (lanes.length === 0) return null

  const target = lanes.find(l => l.key === targetKey) ?? lanes[0]
  const isYou = (lane: LaneView) => lane.key === youName || lane.key === TOGETHER_KEY

  // "YOUR GO" / "HER GO" carries who may lift next; e-ink spells it out plainly
  // instead, because there is no colour to tell the lanes apart.
  const goLabel = (lane: LaneView) => {
    if (einkMode) return 'GO NOW'
    if (lane.key === TOGETHER_KEY) return 'GO'
    return lane.key === youName ? 'YOUR GO' : `${lane.names[0] ?? 'THEIR'} GO`.toUpperCase()
  }

  const laneLabel = (lane: LaneView) => {
    if (lane.key === TOGETHER_KEY) return lane.names.join(' + ').toUpperCase() || 'BOTH'
    return (lane.key === youName ? 'You' : lane.names[0] ?? lane.key).toUpperCase()
  }

  return (
    <div className="v2-dock" role="region" aria-label="Rest timers">
      {lanes.map(lane => {
        const merged = lane.key === TOGETHER_KEY
        const selected = lane.key === target.key
        const tone = merged ? 'both' : isYou(lane) ? 'you' : 'partner'
        return (
          <button
            key={lane.key}
            type="button"
            className={`v2-lane v2-tone-${tone}${merged ? ' v2-lane-merged' : ''}${selected ? ' v2-lane-target' : ''}`}
            onClick={() => onTarget(lane.key)}
            aria-label={`${laneLabel(lane)} rest: ${lane.done ? 'go now' : `${lane.remaining} seconds left`}. Tap to control this lane.`}
            aria-pressed={selected}
          >
            {showNames && <span className="v2-lane-name">{laneLabel(lane)}</span>}
            <span className="v2-lane-track" aria-hidden="true">
              <span className="v2-lane-fill" style={{ width: `${lane.progress * 100}%` }} />
            </span>
            {lane.done ? (
              <span className="v2-lane-go">{goLabel(lane)}</span>
            ) : (
              <span className={`v2-lane-time${lane.paused ? ' v2-lane-paused' : ''}`}>{clock(lane.remaining)}</span>
            )}
          </button>
        )
      })}

      <div className="v2-dock-controls" role="group" aria-label={`Rest controls for ${laneLabel(target)}`}>
        <button className="v2-dock-btn" onClick={() => onAdjust(target.key, -15)} aria-label="Subtract 15 seconds">−15s</button>
        <button className="v2-dock-btn" onClick={() => onTogglePause(target.key)} aria-label={target.paused ? 'Resume rest' : 'Pause rest'}>
          {target.paused ? 'Resume' : 'Pause'}
        </button>
        <button className="v2-dock-btn" onClick={() => onAdjust(target.key, 15)} aria-label="Add 15 seconds">+15s</button>
        <button className="v2-dock-btn" onClick={() => onSkip(target.key)} aria-label="Skip rest">Skip</button>
      </div>
      {lanes.length > 1 && (
        <div className="v2-dock-hint">controls follow the tapped lane · {laneLabel(target)}</div>
      )}
    </div>
  )
}
