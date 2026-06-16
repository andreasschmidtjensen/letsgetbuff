import { useState } from 'react'
import { useStore } from '../store/store'
import { todayKey } from '../lib/date'

type MetricKey = 'bodyweightKg' | 'sleepHrs' | 'proteinG'

const METRIC_CONFIG: {
  key: MetricKey
  label: string
  unit: string
  step: number
  target?: number
  targetLabel?: string
  note?: string
}[] = [
  { key: 'bodyweightKg', label: 'Bodyweight', unit: 'kg', step: 0.1 },
  { key: 'sleepHrs', label: 'Sleep', unit: 'hrs', step: 0.5 },
  {
    key: 'proteinG',
    label: 'Protein',
    unit: 'g',
    step: 1,
    target: 140,
    targetLabel: 'Target 140g',
    note: 'Target: 130-150 g/day (~1.5 g/kg bodyweight)',
  },
]

function movingAvg(values: number[], window = 7): (number | null)[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1)
    return slice.length >= 3 ? slice.reduce((a, b) => a + b, 0) / slice.length : null
  })
}

interface ChartPoint { date: string; value: number }

function MetricChart({
  points,
  unit,
  color = 'var(--accent)',
  target,
  targetLabel,
  smoothed,
}: {
  points: ChartPoint[]
  unit: string
  color?: string
  target?: number
  targetLabel?: string
  smoothed?: (number | null)[]
}) {
  if (points.length < 2) return null

  const W = 320
  const H = 100
  const PAD = { top: 8, right: 8, bottom: 22, left: 36 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const rawVals = points.map(p => p.value)
  const allVals = target !== undefined ? [...rawVals, target] : rawVals
  const minV = Math.min(...allVals) * 0.97
  const maxV = Math.max(...allVals) * 1.03
  const rangeV = maxV - minV || 1

  const minT = new Date(points[0].date).getTime()
  const maxT = new Date(points[points.length - 1].date).getTime()
  const rangeT = maxT - minT || 1

  function toX(date: string) {
    return PAD.left + ((new Date(date).getTime() - minT) / rangeT) * innerW
  }
  function toY(val: number) {
    return PAD.top + (1 - (val - minV) / rangeV) * innerH
  }

  const primaryPts = points.map(p => `${toX(p.date).toFixed(1)},${toY(p.value).toFixed(1)}`).join(' ')

  const smoothedPts = smoothed
    ? points
        .map((p, i) => (smoothed[i] !== null ? `${toX(p.date).toFixed(1)},${toY(smoothed[i]!).toFixed(1)}` : null))
        .filter(Boolean)
        .join(' ')
    : null

  const targetY = target !== undefined ? toY(target) : null

  const minD = points[0].date
  const maxD = points[points.length - 1].date

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, display: 'block' }} aria-hidden="true">
      {[minV, maxV].map((v, i) => (
        <text key={i} x={PAD.left - 4} y={i === 0 ? PAD.top + innerH + 3 : PAD.top + 4} textAnchor="end" fontSize={9} fill="var(--text-muted)">
          {v % 1 === 0 ? Math.round(v) : v.toFixed(1)}{unit}
        </text>
      ))}
      <text x={PAD.left} y={H - 2} textAnchor="start" fontSize={9} fill="var(--text-muted)">{minD.slice(5)}</text>
      <text x={PAD.left + innerW} y={H - 2} textAnchor="end" fontSize={9} fill="var(--text-muted)">{maxD.slice(5)}</text>
      <line x1={PAD.left} y1={PAD.top + innerH} x2={PAD.left + innerW} y2={PAD.top + innerH} stroke="var(--border)" strokeWidth={1} />
      {targetY !== null && (
        <>
          <line x1={PAD.left} y1={targetY} x2={PAD.left + innerW} y2={targetY} stroke="var(--green)" strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.7} />
          {targetLabel && (
            <text x={PAD.left + innerW - 2} y={targetY - 3} textAnchor="end" fontSize={8} fill="var(--green)" opacity={0.8}>{targetLabel}</text>
          )}
        </>
      )}
      <polyline points={primaryPts} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.4} />
      {smoothedPts && (
        <polyline points={smoothedPts} fill="none" stroke={color} strokeWidth={2} />
      )}
      {points.map(p => (
        <circle key={p.date} cx={toX(p.date)} cy={toY(p.value)} r={2.5} fill={color} opacity={0.6} />
      ))}
    </svg>
  )
}

export default function MetricsView() {
  const { state, dispatch } = useStore()
  const today = todayKey()
  const [date, setDate] = useState(today)

  const entry = state.metrics[date] ?? {}
  const [draft, setDraft] = useState<Record<string, string>>({
    bodyweightKg: String(entry.bodyweightKg ?? ''),
    sleepHrs: String(entry.sleepHrs ?? ''),
    proteinG: String(entry.proteinG ?? ''),
  })

  const handleChange = (key: MetricKey, raw: string) => {
    setDraft(d => ({ ...d, [key]: raw }))
    const val = raw === '' ? undefined : Number(raw)
    dispatch({ type: 'SET_METRIC', date, metric: { [key]: val } })
  }

  const handleDateChange = (d: string) => {
    setDate(d)
    const e = state.metrics[d] ?? {}
    setDraft({
      bodyweightKg: String(e.bodyweightKg ?? ''),
      sleepHrs: String(e.sleepHrs ?? ''),
      proteinG: String(e.proteinG ?? ''),
    })
  }

  const dateKeys = Object.keys(state.metrics).sort()

  return (
    <div>
      <h2>Body Metrics</h2>

      <div className="card mb-12">
        <div className="card-title">Log for date</div>
        <input
          type="date"
          className="input mb-12"
          value={date}
          max={today}
          onChange={e => handleDateChange(e.target.value)}
        />
        {METRIC_CONFIG.map(m => (
          <div key={m.key} className="mb-8">
            <label>
              {m.label} ({m.unit}){m.note ? ` - ${m.note}` : ''}
            </label>
            <input
              type="number"
              className="input"
              value={draft[m.key]}
              step={m.step}
              min={0}
              onChange={e => handleChange(m.key, e.target.value)}
              placeholder={`Enter ${m.label.toLowerCase()}`}
            />
          </div>
        ))}
      </div>

      {METRIC_CONFIG.map(m => {
        const points = dateKeys
          .map(k => ({ date: k, value: state.metrics[k]?.[m.key] as number | undefined }))
          .filter((p): p is { date: string; value: number } => p.value !== undefined)

        if (points.length === 0) return null

        const vals = points.map(p => p.value)
        const isBodyweight = m.key === 'bodyweightKg'
        const avg = isBodyweight ? movingAvg(vals) : undefined
        const latest = vals[vals.length - 1]
        const min = Math.min(...vals)
        const max = Math.max(...vals)

        return (
          <div className="card mb-12" key={m.key}>
            <div className="card-title" style={{ marginBottom: 4 }}>{m.label} trend</div>
            {isBodyweight && points.length >= 3 && (
              <div className="muted mb-8" style={{ fontSize: 11 }}>
                Faint line = raw · solid = 7-day avg
              </div>
            )}
            <MetricChart
              points={points}
              unit={m.unit}
              color={m.key === 'sleepHrs' ? 'var(--blue)' : 'var(--accent)'}
              target={m.target}
              targetLabel={m.targetLabel}
              smoothed={avg}
            />
            <div className="row mt-8" style={{ justifyContent: 'space-between' }}>
              <span className="muted" style={{ fontSize: 12 }}>Min: {min}{m.unit}</span>
              <span className="muted" style={{ fontSize: 12 }}>
                Latest: <strong style={{ color: 'var(--text)' }}>{latest}{m.unit}</strong>
                {m.key === 'proteinG' && m.target && (
                  <span style={{ color: latest >= m.target ? 'var(--green)' : 'var(--text-muted)', marginLeft: 6, fontSize: 11 }}>
                    {latest >= m.target ? 'on target' : `${m.target - latest}g short`}
                  </span>
                )}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>Max: {max}{m.unit}</span>
            </div>
          </div>
        )
      })}

      {dateKeys.length === 0 && (
        <div className="card">
          <p className="muted" style={{ fontSize: 13 }}>No metrics logged yet. Start by logging today above.</p>
        </div>
      )}
    </div>
  )
}
