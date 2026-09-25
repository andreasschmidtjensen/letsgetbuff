import { useRef, useState } from 'react'
import { useStore } from '../store/store'
import HomeWorkout from '../components/HomeWorkout'
import YouTubeEmbed from '../components/YouTubeEmbed'
import { preloadTimerSounds } from '../lib/sounds'
import {
  dateKey, homeWorkoutMinutes, HOME_WORKOUT, getHomeLevel,
  explainHomeLevel, describeHomeLevel,
} from '@letsgetbuff/shared'
import type { HomeExercise, StretchLevelId } from '@letsgetbuff/shared'

// Home training tab (issue #3, leveled + explained in v52): the bodyweight
// circuit's own screen — overview, per-exercise variant cards with the
// suggested level, ↓/↑ overrides, "? Why" panels, and the start button.
// Same mute key as the other timer views.
const MUTE_KEY = 'letsgetbuff-mute'

function ExerciseCard({ ex, level, suggested, onLevel, whyText }: {
  ex: HomeExercise
  level: StretchLevelId
  suggested: StretchLevelId
  onLevel: (lvl: StretchLevelId) => void
  whyText: string
}) {
  const lvl = getHomeLevel(ex, level)
  const [showVideo, setShowVideo] = useState(false)
  const [showWhy, setShowWhy] = useState(false)
  const panelId = `home-why-${ex.id}`
  return (
    <div className="card mb-8">
      <div className="row gap-8" style={{ justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span className="exercise-name" style={{ fontSize: 15 }}>{lvl.name}</span>
        <div className="row gap-4" style={{ alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => onLevel(Math.max(1, level - 1) as StretchLevelId)} disabled={level <= 1} aria-label={`Easier ${ex.name} variant`}>↓</button>
          <span style={{ fontSize: 12 }}>Level {level}/3{level !== suggested ? '*' : ''}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => onLevel(Math.min(3, level + 1) as StretchLevelId)} disabled={level >= 3} aria-label={`Harder ${ex.name} variant`}>↑</button>
          <button
            className="btn btn-secondary btn-sm explain-btn"
            onClick={() => setShowWhy(w => !w)}
            aria-expanded={showWhy}
            aria-controls={panelId}
            aria-label={`Explain why ${lvl.name}`}
            title="Explain why"
          >?</button>
        </div>
      </div>
      {showWhy && (
        <div id={panelId} className="explain-panel" role="note">
          <p><strong>Why this exercise</strong><br />{ex.purpose}</p>
          <p><strong>Why this variant</strong><br />{whyText}{level !== suggested ? ` (You have overridden the suggestion of level ${suggested} for today.)` : ''}</p>
          <p><strong>When to move up</strong><br />{lvl.progressNote}</p>
        </div>
      )}
      <div style={{ margin: '8px 0' }}>
        {showVideo ? (
          <div>
            <YouTubeEmbed videoId={lvl.videoId} vertical={lvl.vertical} title={lvl.name} />
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => setShowVideo(false)}>
              Hide video
            </button>
          </div>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={() => setShowVideo(true)}>▶ Watch video</button>
        )}
      </div>
      <ul className="muted" style={{ fontSize: 13, margin: 0, paddingLeft: 18 }}>
        {lvl.cues.map((c, i) => <li key={i}>{c}</li>)}
      </ul>
    </div>
  )
}

export default function HomeTrainingView() {
  const { state } = useStore()
  const todayStr = dateKey(new Date())
  const [running, setRunning] = useState(false)
  const [overrides, setOverrides] = useState<Record<string, StretchLevelId>>({})
  const audioCtxRef = useRef<AudioContext | null>(null)
  const doneToday = (state.activities[todayStr] ?? []).some(a => a.type === 'home')

  // Suggested variant per exercise, from circuit history (felt-easy streaks,
  // 28-day break regression) — the ↓/↑ override wins for today's run.
  const infoFor = (ex: HomeExercise) => explainHomeLevel(state, ex.id, todayStr)
  const levelFor = (ex: HomeExercise): StretchLevelId => overrides[ex.id] ?? infoFor(ex).level
  const levels = Object.fromEntries(HOME_WORKOUT.exercises.map(e => [e.id, levelFor(e)]))

  // AudioContext must be created inside the click gesture or mobile browsers
  // keep it suspended (same pattern as HomeView / WorkoutView).
  const start = () => {
    preloadTimerSounds()
    if (!audioCtxRef.current) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctor) audioCtxRef.current = new Ctor()
    }
    setRunning(true)
  }

  return (
    <div className="view-narrow">
      {running && (
        <HomeWorkout
          audioCtx={audioCtxRef.current}
          muted={localStorage.getItem(MUTE_KEY) === '1'}
          levels={levels}
          onClose={() => setRunning(false)}
        />
      )}

      <div className="row gap-8 mb-8" style={{ flexWrap: 'wrap', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0 }}>Home training</h2>
        {doneToday && <span className="badge badge-green">Done today</span>}
      </div>

      <div className="card mb-12">
        <div className="card-title">{HOME_WORKOUT.name}</div>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          No equipment, ~{homeWorkoutMinutes()} min door to door: {HOME_WORKOUT.rounds} rounds
          of {HOME_WORKOUT.exercises.length} exercises, {HOME_WORKOUT.workSeconds}s work
          / {HOME_WORKOUT.restSeconds}s rest. It progresses by swapping in <strong>harder
          variants</strong>, not longer intervals — tick "felt easy" when you finish, and two
          easy circuits in a row suggest the next variant.
        </p>
      </div>

      <button className="btn btn-primary btn-start-focus mb-12" onClick={start} aria-label="Start home workout">
        ▶ Start home workout
      </button>

      <h3 style={{ margin: '4px 0 8px' }}>Exercises</h3>
      {HOME_WORKOUT.exercises.map(ex => (
        <ExerciseCard
          key={ex.id}
          ex={ex}
          level={levelFor(ex)}
          suggested={infoFor(ex).level}
          onLevel={lvl => setOverrides(o => ({ ...o, [ex.id]: lvl }))}
          whyText={describeHomeLevel(infoFor(ex))}
        />
      ))}
    </div>
  )
}
