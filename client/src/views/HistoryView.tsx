import { useState, useMemo, useEffect } from 'react'
import { useStore } from '../store/store'
import { WORKOUTS } from '@letsgetbuff/shared'
import type { ExerciseDef, Session } from '@letsgetbuff/shared'

// ── 1RM formula (Epley) ──────────────────────────────────────────────────────
function epley1RM(kg: number, reps: number): number {
  if (reps === 1) return kg
  return kg * (1 + reps / 30)
}

// ── Session volume: total kg × reps ──────────────────────────────────────────
function sessionVolume(session: Session): number {
  let total = 0
  for (const entry of Object.values(session.entries)) {
    for (const s of entry.sets) {
      if (s.kg !== undefined && s.reps !== undefined && s.reps > 0) {
        total += s.kg * s.reps
      }
    }
  }
  return Math.round(total)
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
  const primaryOk = points.length >= 2
  const secondaryOk = (secondaryPoints?.length ?? 0) >= 2

  if (!primaryOk && !secondaryOk) {
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

  const allDates = [
    ...points.map(p => p.date),
    ...(secondaryPoints ?? []).map(p => p.date),
  ].sort()
  const minD = allDates[0]
  const maxD = allDates[allDates.length - 1]
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

  const xLabels = [
    { date: minD, x: PAD.left },
    { date: maxD, x: PAD.left + innerW },
  ]
  const yLabels = [
    { val: maxV, y: PAD.top },
    { val: minV, y: PAD.top + innerH },
  ]

  return (
    <div>
      {(label || secondaryLabel) && (
        <div className="row gap-8 mb-8" style={{ fontSize: 11 }}>
          {label && primaryOk && (
            <span style={{ color, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 16, height: 2, background: color, borderRadius: 1 }} />
              {label}
            </span>
          )}
          {secondaryLabel && secondaryOk && (
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
        {yLabels.map(({ val, y }) => (
          <text key={y} x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize={9} fill="var(--text-muted)">
            {val % 1 === 0 ? val : val.toFixed(1)}{unit}
          </text>
        ))}
        {xLabels.map(({ date, x }, i) => (
          <text
            key={date}
            x={x}
            y={H - 2}
            textAnchor={i === 0 ? 'start' : 'end'}
            fontSize={9}
            fill="var(--text-muted)"
          >
            {date.slice(5)}
          </text>
        ))}
        <line
          x1={PAD.left} y1={PAD.top + innerH}
          x2={PAD.left + innerW} y2={PAD.top + innerH}
          stroke="var(--border)" strokeWidth={1}
        />
        {secondaryOk && secondaryPoints && (
          <polyline
            points={polyline(secondaryPoints)}
            fill="none"
            stroke={secondaryColor}
            strokeWidth={1.5}
            strokeOpacity={0.7}
            strokeDasharray="4 3"
          />
        )}
        {primaryOk && (
          <>
            <polyline
              points={polyline(points)}
              fill="none"
              stroke={color}
              strokeWidth={2}
            />
            {points.map(p => (
              <circle
                key={p.date}
                cx={toX(p.date)}
                cy={toY(p.value)}
                r={3}
                fill={color}
              />
            ))}
          </>
        )}
      </svg>
    </div>
  )
}

// ── Exercise helpers ─────────────────────────────────────────────────────────
const ALL_EXERCISES: ExerciseDef[] = WORKOUTS.flatMap(w => w.exercises)
const WEIGHTED = ALL_EXERCISES.filter(e => e.requiresKg)

// ── Per-exercise data points ─────────────────────────────────────────────────
function buildLiftPoints(sessions: Record<string, Session>, exerciseId: string) {
  return Object.entries(sessions)
    .filter(([, s]) => s.entries[exerciseId])
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([date, session]) => {
      const entry = session.entries[exerciseId]
      if (!entry) return []
      const validSets = entry.sets.filter(s => s.kg !== undefined && (s.reps ?? 0) > 0)
      if (validSets.length === 0) return []
      const best = validSets.reduce<{ kg: number; reps: number; e1rm: number }>(
        (acc, s) => {
          const e1rm = epley1RM(s.kg!, s.reps!)
          return e1rm > acc.e1rm ? { kg: s.kg!, reps: s.reps!, e1rm } : acc
        },
        { kg: 0, reps: 0, e1rm: 0 },
      )
      return [{ date, topKg: best.kg, topReps: best.reps, e1rm: Math.round(best.e1rm * 10) / 10 }]
    })
}

// ── Main view ────────────────────────────────────────────────────────────────
type HistoryTab = 'lifts' | 'volume'

export default function HistoryView({ username }: { username: string }) {
  const { state } = useStore()
  const [tab, setTab] = useState<HistoryTab>('lifts')
  const [selectedId, setSelectedId] = useState(WEIGHTED[0]?.id ?? '')
  const [partnerUsername, setPartnerUsername] = useState<string | null>(null)
  const [partnerSessions, setPartnerSessions] = useState<Record<string, Session>>({})

  useEffect(() => {
    fetch('/api/partner-history', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: { partnerUsername: string | null; sessions: Record<string, Session> } | null) => {
        if (data) {
          setPartnerUsername(data.partnerUsername ?? null)
          setPartnerSessions(data.sessions ?? {})
        }
      })
      .catch(() => {})
  }, [])

  const exercise = ALL_EXERCISES.find(e => e.id === selectedId)

  // ── Lifts tab ─────────────────────────────────────────────────────────────

  const myDataPoints = useMemo(
    () => buildLiftPoints(state.sessions, selectedId),
    [state.sessions, selectedId],
  )
  const partnerDataPoints = useMemo(
    () => buildLiftPoints(partnerSessions, selectedId),
    [partnerSessions, selectedId],
  )

  const hasData = myDataPoints.length > 0
  const hasPartner = partnerUsername !== null
  const hasPartnerData = partnerDataPoints.length > 0

  const myWeightPoints: LinePoint[] = myDataPoints.map(d => ({ date: d.date, value: d.topKg }))
  const myIrmPoints: LinePoint[] = myDataPoints.map(d => ({ date: d.date, value: d.e1rm }))
  const partnerWeightPoints: LinePoint[] = partnerDataPoints.map(d => ({ date: d.date, value: d.topKg }))

  const latest = myDataPoints[myDataPoints.length - 1]
  const first = myDataPoints[0]
  const gainKg = hasData && myDataPoints.length >= 2 ? latest.topKg - first.topKg : null
  const gainIrm = hasData && myDataPoints.length >= 2 ? latest.e1rm - first.e1rm : null

  // ── Volume tab ───────────────────────────────────────────────────────────

  const myVolumePoints: LinePoint[] = useMemo(() => {
    return Object.entries(state.sessions)
      .filter(([, s]) => s.workout === 'A' || s.workout === 'B')
      .map(([date, session]) => ({ date, value: sessionVolume(session) }))
      .filter(p => p.value > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [state.sessions])

  const partnerVolumePoints: LinePoint[] = useMemo(() => {
    return Object.entries(partnerSessions)
      .filter(([, s]) => s.workout === 'A' || s.workout === 'B')
      .map(([date, session]) => ({ date, value: sessionVolume(session) }))
      .filter(p => p.value > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [partnerSessions])

  const myAvgVolume = myVolumePoints.length > 0
    ? Math.round(myVolumePoints.reduce((s, p) => s + p.value, 0) / myVolumePoints.length)
    : null
  const partnerAvgVolume = partnerVolumePoints.length > 0
    ? Math.round(partnerVolumePoints.reduce((s, p) => s + p.value, 0) / partnerVolumePoints.length)
    : null

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      <h2>History</h2>

      <div className="row gap-8 mb-12">
        <button
          className={`btn btn-sm ${tab === 'lifts' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('lifts')}
          aria-pressed={tab === 'lifts'}
        >
          Lifts
        </button>
        <button
          className={`btn btn-sm ${tab === 'volume' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('volume')}
          aria-pressed={tab === 'volume'}
        >
          Volume
        </button>
      </div>

      {/* ── Lifts tab ───────────────────────────────────────────────────── */}
      {tab === 'lifts' && (
        <>
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

          {!hasData && !hasPartnerData ? (
            <div className="card mb-12">
              <p className="muted" style={{ fontSize: 13 }}>
                No data yet for {exercise?.name ?? 'this exercise'}. Log a session first.
              </p>
            </div>
          ) : (
            <>
              {hasData && (
                <div className="card mb-12">
                  <div className="card-title">My summary</div>
                  <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 80 }}>
                      <div className="muted" style={{ fontSize: 11 }}>Sessions</div>
                      <div style={{ fontWeight: 700, fontSize: 20 }}>{myDataPoints.length}</div>
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
              )}

              <div className="card mb-12">
                <div className="card-title">
                  Lift progress
                  {hasPartner && hasPartnerData && (
                    <span className="muted" style={{ fontWeight: 400, fontSize: 12, marginLeft: 6 }}>
                      top set weight
                    </span>
                  )}
                </div>
                {hasPartner ? (
                  <LineChart
                    points={myWeightPoints}
                    color="var(--accent)"
                    secondaryPoints={partnerWeightPoints}
                    secondaryColor="var(--blue)"
                    label={username}
                    secondaryLabel={partnerUsername ?? undefined}
                    unit="kg"
                  />
                ) : (
                  <LineChart
                    points={myWeightPoints}
                    color="var(--accent)"
                    secondaryPoints={myIrmPoints}
                    secondaryColor="var(--blue)"
                    label="Top set (kg)"
                    secondaryLabel="Est. 1RM (kg)"
                    unit="kg"
                  />
                )}
              </div>

              {hasData && (
                <div className="card mb-12">
                  <div className="card-title">Session log</div>
                  {[...myDataPoints].reverse().map(d => (
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
              )}

              {hasPartner && hasPartnerData && (
                <div className="card mb-12">
                  <div className="card-title">{partnerUsername}'s session log</div>
                  {[...partnerDataPoints].reverse().map(d => (
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
                        <strong style={{ color: 'var(--blue)' }}>{d.topKg}kg</strong>
                        <span className="muted"> × {d.topReps} reps</span>
                        <span style={{ color: 'var(--blue)', marginLeft: 8, fontSize: 11 }}>
                          1RM≈{d.e1rm}kg
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Volume tab ──────────────────────────────────────────────────── */}
      {tab === 'volume' && (
        <>
          <div className="card mb-12">
            <div className="card-title">Session volume</div>
            <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 8 }}>
              Total kg × reps across all weighted sets per gym session.
            </p>
            {myVolumePoints.length === 0 && partnerVolumePoints.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>No gym sessions logged yet.</p>
            ) : (
              <LineChart
                points={myVolumePoints}
                color="var(--accent)"
                secondaryPoints={hasPartner ? partnerVolumePoints : undefined}
                secondaryColor="var(--blue)"
                label={username}
                secondaryLabel={hasPartner ? (partnerUsername ?? undefined) : undefined}
                unit=""
              />
            )}
          </div>

          {(myAvgVolume !== null || partnerAvgVolume !== null) && (
            <div className="card mb-12">
              <div className="card-title">Average session volume</div>
              <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
                {myAvgVolume !== null && (
                  <div style={{ flex: 1, minWidth: 100 }}>
                    <div className="muted" style={{ fontSize: 11 }}>{username}</div>
                    <div style={{ fontWeight: 700, fontSize: 22, color: 'var(--accent)' }}>
                      {myAvgVolume.toLocaleString()} kg
                    </div>
                  </div>
                )}
                {hasPartner && partnerAvgVolume !== null && (
                  <div style={{ flex: 1, minWidth: 100 }}>
                    <div className="muted" style={{ fontSize: 11 }}>{partnerUsername}</div>
                    <div style={{ fontWeight: 700, fontSize: 22, color: 'var(--blue)' }}>
                      {partnerAvgVolume.toLocaleString()} kg
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {myVolumePoints.length > 0 && (
            <div className="card mb-12">
              <div className="card-title">Volume log</div>
              {[...myVolumePoints].reverse().map(p => (
                <div
                  key={p.date}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    borderBottom: '1px solid var(--border)',
                    fontSize: 13,
                  }}
                >
                  <span className="muted">{p.date}</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                    {p.value.toLocaleString()} kg
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
