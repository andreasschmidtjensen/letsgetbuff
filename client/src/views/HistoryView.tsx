import { useState, useMemo } from 'react'
import { useStore } from '../store/store'
import { WORKOUTS } from '@letsgetbuff/shared'
import type { ExerciseDef } from '@letsgetbuff/shared'

// ── 1RM formula (Epley) ──────────────────────────────────────────────────────
function epley1RM(kg: number, reps: number): number {
  if (reps === 1) return kg
  return kg * (1 + reps / 30)
}

// ── Inline SVG line chart ────────────────────────────────────────────────────
interface LinePoint { date: string; value: number }

function LineChart({
  points,
  color = 'var(--accent)',
  secondaryPoints,
  secondaryColor = 'var(--blue)',
  label,
  secondaryLabel,
  unit = '',
}: {
  points: LinePoint[]
  color?: string
  secondaryPoints?: LinePoint[]
  secondaryColor?: string
  label?: string
  secondaryLabel?: string
  unit?: string
}) {
  if (points.length < 2) {
    return (
      <div className="muted" style={{ fontSize: 12, padding: '8px 0' }}>
        Not enough data yet (need at least 2 sessions).
      </div>
    )
  }

  const W = 320
  const H = 100
  const PAD = { top: 8, right: 8, bottom: 24, left: 36 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const allValues = [
    ...points.map(p => p.value),
    ...(secondaryPoints ?? []).map(p => p.value),
  ]
  const minV = Math.min(...allValues)
  const maxV = Math.max(...allValues)
  const rangeV = maxV - minV || 1

  const dates = points.map(p => p.date)
  const minD = dates[0]
  const maxD = dates[dates.length - 1]
  const minT = new Date(minD).getTime()
  const maxT = new Date(maxD).getTime()
  const rangeT = maxT - minT || 1

  function toX(date: string) {
    return PAD.left + ((new Date(date).getTime() - minT) / rangeT) * innerW
  }
  function toY(val: number) {
    return PAD.top + (1 - (val - minV) / rangeV) * innerH
  }

  function polyline(pts: LinePoint[]) {
    return pts.map(p => `${toX(p.date).toFixed(1)},${toY(p.value).toFixed(1)}`).join(' ')
  }

  // x-axis labels: first and last
  const xLabels = [
    { date: minD, x: PAD.left },
    { date: maxD, x: PAD.left + innerW },
  ]
  // y-axis labels: min and max
  const yLabels = [
    { val: maxV, y: PAD.top },
    { val: minV, y: PAD.top + innerH },
  ]

  return (
    <div>
      {(label || secondaryLabel) && (
        <div className="row gap-8 mb-8" style={{ fontSize: 11 }}>
          {label && (
            <span style={{ color, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 16, height: 2, background: color, borderRadius: 1 }} />
              {label}
            </span>
          )}
          {secondaryLabel && secondaryPoints && secondaryPoints.length >= 2 && (
            <span style={{ color: secondaryColor, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 16, height: 2, background: secondaryColor, borderRadius: 1, opacity: 0.7 }} />
              {secondaryLabel}
            </span>
          )}
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', maxWidth: W, display: 'block' }}
        aria-hidden="true"
      >
        {/* y-axis labels */}
        {yLabels.map(({ val, y }) => (
          <text key={y} x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize={9} fill="var(--text-muted)">
            {val % 1 === 0 ? val : val.toFixed(1)}{unit}
          </text>
        ))}
        {/* x-axis labels */}
        {xLabels.map(({ date, x }, i) => (
          <text
            key={date}
            x={x}
            y={H - 2}
            textAnchor={i === 0 ? 'start' : 'end'}
            fontSize={9}
            fill="var(--text-muted)"
          >
            {date.slice(5)} {/* MM-DD */}
          </text>
        ))}
        {/* baseline */}
        <line
          x1={PAD.left} y1={PAD.top + innerH}
          x2={PAD.left + innerW} y2={PAD.top + innerH}
          stroke="var(--border)" strokeWidth={1}
        />
        {/* secondary line */}
        {secondaryPoints && secondaryPoints.length >= 2 && (
          <polyline
            points={polyline(secondaryPoints)}
            fill="none"
            stroke={secondaryColor}
            strokeWidth={1.5}
            strokeOpacity={0.7}
            strokeDasharray="4 3"
          />
        )}
        {/* primary line */}
        <polyline
          points={polyline(points)}
          fill="none"
          stroke={color}
          strokeWidth={2}
        />
        {/* dots on primary */}
        {points.map(p => (
          <circle
            key={p.date}
            cx={toX(p.date)}
            cy={toY(p.value)}
            r={3}
            fill={color}
          />
        ))}
      </svg>
    </div>
  )
}

// ── All exercises flat list ──────────────────────────────────────────────────
const ALL_EXERCISES: ExerciseDef[] = WORKOUTS.flatMap(w => w.exercises)
const WEIGHTED = ALL_EXERCISES.filter(e => e.requiresKg)

// ── Main view ────────────────────────────────────────────────────────────────
export default function HistoryView() {
  const { state } = useStore()
  const [selectedId, setSelectedId] = useState(WEIGHTED[0]?.id ?? '')

  const exercise = ALL_EXERCISES.find(e => e.id === selectedId)

  // All sessions that contain this exercise, sorted oldest→newest
  const sessionEntries = useMemo(() => {
    return Object.entries(state.sessions)
      .filter(([, s]) => s.entries[selectedId])
      .sort(([a], [b]) => a.localeCompare(b))
  }, [state.sessions, selectedId])

  // Per session: top set by kg, estimated 1RM
  const dataPoints = useMemo(() => {
    return sessionEntries.flatMap(([date, session]) => {
      const entry = session.entries[selectedId]
      if (!entry) return []
      const validSets = entry.sets.filter(s => s.kg !== undefined && (s.reps ?? 0) > 0)
      if (validSets.length === 0) return []
      // top set = highest estimated 1RM
      const best = validSets.reduce<{ kg: number; reps: number; e1rm: number }>((best, s) => {
        const e1rm = epley1RM(s.kg!, s.reps!)
        return e1rm > best.e1rm ? { kg: s.kg!, reps: s.reps!, e1rm } : best
      }, { kg: 0, reps: 0, e1rm: 0 })
      return [{ date, topKg: best.kg, topReps: best.reps, e1rm: Math.round(best.e1rm * 10) / 10 }]
    })
  }, [sessionEntries, selectedId])

  const weightPoints: LinePoint[] = dataPoints.map(d => ({ date: d.date, value: d.topKg ?? 0 }))
  const irmPoints: LinePoint[] = dataPoints.map(d => ({ date: d.date, value: d.e1rm ?? 0 }))

  const hasData = dataPoints.length > 0
  const latest = dataPoints[dataPoints.length - 1]
  const first = dataPoints[0]
  const gainKg = hasData && dataPoints.length >= 2 ? (latest.topKg ?? 0) - (first.topKg ?? 0) : null
  const gainIrm = hasData && dataPoints.length >= 2 ? (latest.e1rm ?? 0) - (first.e1rm ?? 0) : null

  return (
    <div>
      <h2>History</h2>

      {/* Exercise selector */}
      <div className="card mb-12">
        <div className="card-title">Exercise</div>
        <select
          className="input"
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          aria-label="Select exercise"
        >
          {WORKOUTS.map(w => (
            <optgroup key={w.id} label={`Workout ${w.id} — ${w.name}`}>
              {w.exercises.filter(e => e.requiresKg).map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {!hasData ? (
        <div className="card mb-12">
          <p className="muted" style={{ fontSize: 13 }}>
            No data yet for {exercise?.name ?? 'this exercise'}. Log a session first.
          </p>
        </div>
      ) : (
        <>
          {/* Summary row */}
          <div className="card mb-12">
            <div className="card-title">Summary</div>
            <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 80 }}>
                <div className="muted" style={{ fontSize: 11 }}>Sessions</div>
                <div style={{ fontWeight: 700, fontSize: 20 }}>{dataPoints.length}</div>
              </div>
              <div style={{ flex: 1, minWidth: 80 }}>
                <div className="muted" style={{ fontSize: 11 }}>Top weight</div>
                <div style={{ fontWeight: 700, fontSize: 20 }}>{latest.topKg}kg</div>
              </div>
              <div style={{ flex: 1, minWidth: 80 }}>
                <div className="muted" style={{ fontSize: 11 }}>Est. 1RM</div>
                <div style={{ fontWeight: 700, fontSize: 20 }}>{latest.e1rm}kg</div>
              </div>
              {gainKg !== null && (
                <div style={{ flex: 1, minWidth: 80 }}>
                  <div className="muted" style={{ fontSize: 11 }}>Total gain</div>
                  <div style={{ fontWeight: 700, fontSize: 20, color: gainKg >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {gainKg >= 0 ? '+' : ''}{gainKg}kg
                  </div>
                </div>
              )}
              {gainIrm !== null && (
                <div style={{ flex: 1, minWidth: 80 }}>
                  <div className="muted" style={{ fontSize: 11 }}>+1RM</div>
                  <div style={{ fontWeight: 700, fontSize: 20, color: gainIrm >= 0 ? 'var(--blue)' : 'var(--red)' }}>
                    {gainIrm >= 0 ? '+' : ''}{gainIrm}kg
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Top-set chart */}
          {dataPoints.length >= 2 && (
            <div className="card mb-12">
              <div className="card-title">Lift progress</div>
              <LineChart
                points={weightPoints}
                color="var(--accent)"
                secondaryPoints={irmPoints}
                secondaryColor="var(--blue)"
                label="Top set (kg)"
                secondaryLabel="Est. 1RM (kg)"
                unit="kg"
              />
            </div>
          )}

          {/* Session history */}
          <div className="card mb-12">
            <div className="card-title">Session log</div>
            {[...dataPoints].reverse().map(d => (
              <div
                key={d.date}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 13,
                }}
              >
                <span className="muted">{d.date}</span>
                <span>
                  <strong>{d.topKg}kg</strong>
                  <span className="muted"> × {d.topReps} reps</span>
                  <span style={{ color: 'var(--blue)', marginLeft: 8, fontSize: 11 }}>
                    1RM≈{d.e1rm}kg
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
