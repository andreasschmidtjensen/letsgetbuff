import type { ReactNode } from 'react'

/**
 * The redesigned Today card: one primary action for the day, the two optional
 * sessions beside it, and the week at a glance. Same data and same callbacks as
 * the classic card — only the shape changes.
 */

export interface WeekCell {
  /** Mon-Sun initial. */
  initial: string
  /** "A ✓", "B", "·" */
  marker: string
  isToday: boolean
}

interface TodayCardV2Props {
  dateCaption: string
  title: string
  subtitle?: string
  estimate?: string
  done: boolean
  primaryLabel: string | null
  onPrimary: () => void
  onUndo?: () => void
  stretchDone: boolean
  onStretch: () => void
  homeDone: boolean
  homeMinutes: number
  onHome: () => void
  weekDoneLabel: string
  week: WeekCell[]
  activities: ReactNode
  addActivity: ReactNode
}

export default function TodayCardV2(props: TodayCardV2Props) {
  const {
    dateCaption, title, subtitle, estimate, done, primaryLabel, onPrimary, onUndo,
    stretchDone, onStretch, homeDone, homeMinutes, onHome, weekDoneLabel, week, activities, addActivity,
  } = props

  return (
    <div className="ui-v2 v2-today">
      <div className="v2-today-date">{dateCaption}</div>

      <div className="v2-hero">
        <div className="v2-hero-title">{title}{done ? ' ✓' : ''}</div>
        {subtitle && <div className="v2-hero-sub">{subtitle}</div>}
        {estimate && <div className="v2-hero-est">{estimate}</div>}
        {primaryLabel && !done && (
          <button className="v2-start" onClick={onPrimary}>{primaryLabel}</button>
        )}
        {done && onUndo && (
          <button className="v2-tile-btn" onClick={onUndo}>Undo</button>
        )}
        {activities}
      </div>

      <div className="v2-tiles">
        <div className="v2-tile">
          <div className="v2-tile-title">Stretch{stretchDone ? ' ✓' : ''}</div>
          <div className="v2-tile-sub">optional</div>
          <button className="v2-tile-btn" onClick={onStretch}>Open</button>
        </div>
        <div className="v2-tile">
          <div className="v2-tile-title">Home circuit{homeDone ? ' ✓' : ''}</div>
          <div className="v2-tile-sub">~{homeMinutes} min</div>
          <button className="v2-tile-btn" onClick={onHome}>Start</button>
        </div>
      </div>

      <div className="v2-card">
        <div className="v2-cap-row">
          <span className="v2-cap">THIS WEEK</span>
          <span className="v2-cap">{weekDoneLabel}</span>
        </div>
        <div className="v2-week">
          {week.map((c, i) => (
            <div key={i} className={`v2-week-cell${c.isToday ? ' v2-week-today' : ''}`}>
              <span className="v2-week-day">{c.initial}</span>
              <span className="v2-week-mark">{c.marker}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="v2-add-row">
        <span className="v2-add-text">Add a run, ride or rest day</span>
        {addActivity}
      </div>
    </div>
  )
}
