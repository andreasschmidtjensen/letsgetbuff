import { useRef, useState } from 'react'
import { useStore } from '../store/store'
import HomeWorkout from '../components/HomeWorkout'
import YouTubeEmbed from '../components/YouTubeEmbed'
import { preloadTimerSounds } from '../lib/sounds'
import { dateKey, homeWorkoutMinutes, HOME_WORKOUT } from '@letsgetbuff/shared'
import type { HomeExercise } from '@letsgetbuff/shared'

// Home training tab (issue #3): the bodyweight circuit gets its own screen —
// program overview, per-exercise form videos, and the only start button
// outside the Home tab. Same key as the other timer views share for mute.
const MUTE_KEY = 'letsgetbuff-mute'

function ExerciseCard({ ex }: { ex: HomeExercise }) {
  const [showVideo, setShowVideo] = useState(false)
  return (
    <div className="card mb-8">
      <span className="exercise-name" style={{ fontSize: 15 }}>{ex.name}</span>
      <div style={{ margin: '8px 0' }}>
        {showVideo ? (
          <div>
            <YouTubeEmbed videoId={ex.videoId} title={ex.name} />
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => setShowVideo(false)}>
              Hide video
            </button>
          </div>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={() => setShowVideo(true)}>▶ Watch video</button>
        )}
      </div>
      <ul className="muted" style={{ fontSize: 13, margin: 0, paddingLeft: 18 }}>
        {ex.cues.map((c, i) => <li key={i}>{c}</li>)}
      </ul>
    </div>
  )
}

export default function HomeTrainingView() {
  const { state } = useStore()
  const todayStr = dateKey(new Date())
  const [running, setRunning] = useState(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const doneToday = (state.activities[todayStr] ?? []).some(a => a.type === 'home')

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
          / {HOME_WORKOUT.restSeconds}s rest. Finishing logs it on today automatically.
        </p>
      </div>

      <button className="btn btn-primary btn-start-focus mb-12" onClick={start} aria-label="Start home workout">
        ▶ Start home workout
      </button>

      <h3 style={{ margin: '4px 0 8px' }}>Exercises</h3>
      {HOME_WORKOUT.exercises.map(ex => <ExerciseCard key={ex.id} ex={ex} />)}
    </div>
  )
}
