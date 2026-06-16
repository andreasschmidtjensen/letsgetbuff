import { useStore } from '../store/store'
import { QUALITATIVE_MILESTONES, WORKOUTS } from '@letsgetbuff/shared'

const WEIGHTED_EXERCISES = Array.from(
  new Map(
    WORKOUTS.flatMap(w => w.exercises)
      .filter(e => e.requiresKg)
      .map(e => [e.id, e])
  ).values()
)

export default function MilestonesView() {
  const { state, dispatch } = useStore()

  const lifts = WEIGHTED_EXERCISES.map(exercise => {
    const sessions = Object.entries(state.sessions)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, s]) => s.entries[exercise.id])
      .filter(Boolean)

    const topWeights = sessions
      .map(entry => {
        const kgs = entry.sets.map(s => s.kg).filter((k): k is number => k !== undefined)
        return kgs.length > 0 ? Math.max(...kgs) : null
      })
      .filter((k): k is number => k !== null)

    const start = topWeights[0]
    const current = topWeights[topWeights.length - 1]
    const target = start !== undefined ? Math.round(start * 1.5 * 10) / 10 : undefined

    return { exercise, start, current, target, sessions: topWeights.length }
  }).filter(l => l.sessions >= 1)

  return (
    <div>
      <h2>Goals</h2>

      <div className="safety-banner mb-12">
        Key rule: No loaded spinal flexion. Knees track over toes.
      </div>

      <div className="card mb-12">
        <div className="card-title">Strength progress (+50% starting weight)</div>
        {lifts.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            Log some sessions to start tracking lift milestones.
          </p>
        ) : (
          lifts.map(({ exercise, start, current, target }) => {
            if (start === undefined || current === undefined || target === undefined) return null
            const pct = Math.min(100, Math.round(((current - start) / (target - start)) * 100))
            const done = current >= target
            return (
              <div key={exercise.id} style={{ marginBottom: 14 }}>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{exercise.name}</span>
                  <span style={{ fontSize: 12, color: done ? 'var(--green)' : 'var(--text-muted)' }}>
                    {done ? 'done ' : ''}{current}kg / {target}kg
                  </span>
                </div>
                <div style={{ background: 'var(--surface2)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: done ? 'var(--green)' : 'var(--accent)',
                    borderRadius: 4,
                    transition: 'width 0.3s',
                  }} />
                </div>
                <div className="muted mt-4" style={{ fontSize: 11 }}>
                  Start: {start}kg &middot; {done ? 'Goal reached!' : `${Math.round((target - current) * 10) / 10}kg to go`}
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="card">
        <div className="card-title">Self-assessed milestones</div>
        {QUALITATIVE_MILESTONES.map(m => (
          <div key={m.id} className="milestone-row">
            <input
              type="checkbox"
              id={m.id}
              checked={state.milestones[m.id] ?? false}
              onChange={e => dispatch({ type: 'SET_MILESTONE', id: m.id, achieved: e.target.checked })}
              style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent)' }}
            />
            <label htmlFor={m.id} style={{ cursor: 'pointer', margin: 0 }}>{m.label}</label>
          </div>
        ))}
      </div>
    </div>
  )
}
