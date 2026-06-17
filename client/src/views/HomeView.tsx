import { useState } from 'react'
import { useStore } from '../store/store'
import { useEinkMode } from '../store/einkMode'
import { computeProgramWeek, phaseFor, scheduleFor, isoWeekKey, weekKeyToMonday, todayDayName, activityLabel, DayActivity } from '@letsgetbuff/shared'
import { dateKey, keyToDate, addDays } from '../lib/date'
import type { Tab, Session } from '@letsgetbuff/shared'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

function activityBadge(act: DayActivity): string {
  switch (act) {
    case 'gym-a': return 'A'
    case 'gym-b': return 'B'
    case 'bike': return 'Bike'
    case 'run': return 'Run'
    case 'rest': return '-'
  }
}

function activityColor(act: DayActivity): string {
  switch (act) {
    case 'gym-a': return 'var(--accent)'
    case 'gym-b': return 'var(--blue)'
    case 'bike': return 'var(--green)'
    case 'run': return 'var(--green)'
    case 'rest': return 'var(--text-muted)'
  }
}

// Returns the next gym day within 14 days that hasn't been logged as done yet.
function nextGymSession(
  startDate: string,
  skippedWeeks: string[],
  sessions: Record<string, Session>,
  from: Date,
): { dateKey: string; date: Date; workout: 'A' | 'B'; programWeek: number } | null {
  for (let i = 0; i <= 14; i++) {
    const d = new Date(from)
    d.setDate(d.getDate() + i)
    const key = dateKey(d)
    const pw = computeProgramWeek(startDate, skippedWeeks, d)
    const activity = scheduleFor(pw)[todayDayName(d)]
    if ((activity === 'gym-a' || activity === 'gym-b') && !sessions[key]?.done) {
      return { dateKey: key, date: d, workout: activity === 'gym-a' ? 'A' : 'B', programWeek: pw }
    }
  }
  return null
}

// Map a logged session's workout type onto the schedule's activity vocabulary
function sessionActivity(w: Session['workout']): DayActivity {
  switch (w) {
    case 'A': return 'gym-a'
    case 'B': return 'gym-b'
    case 'bike': return 'bike'
    case 'run': return 'run'
    case 'rest': return 'rest'
  }
}

export default function HomeView({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const { state, dispatch } = useStore()
  const { einkMode } = useEinkMode()
  const today = new Date()
  const todayStr = dateKey(today)
  const currentWeekKey = isoWeekKey(today)
  const [startInput, setStartInput] = useState(state.startDate ?? '')
  const [weekOffset, setWeekOffset] = useState(0)

  const isSkipped = state.skippedWeeks.includes(currentWeekKey)

  if (!state.startDate) {
    return (
      <div>
        <h2>Welcome!</h2>
        <p className="muted">Set your program start date to get started.</p>
        <div className="card">
          <div className="card-title">Plan start date</div>
          <input
            type="date"
            className="input mb-8"
            value={startInput}
            max={todayStr}
            onChange={e => setStartInput(e.target.value)}
          />
          <button
            className="btn btn-primary w-full"
            disabled={!startInput}
            onClick={() => dispatch({ type: 'SET_START_DATE', date: startInput })}
          >
            Start program
          </button>
        </div>
      </div>
    )
  }

  const programWeek = computeProgramWeek(state.startDate, state.skippedWeeks, today)
  const { label: phaseLabel } = phaseFor(programWeek)
  const schedule = scheduleFor(programWeek)
  const todayDay = todayDayName(today)
  const todayActivity = schedule[todayDay]
  const todaySession = state.sessions[todayStr]
  // What to display for "Today": the logged workout if one exists, else the scheduled activity
  const todayDisplayActivity = todaySession ? sessionActivity(todaySession.workout) : todayActivity

  const nextGym = nextGymSession(state.startDate, state.skippedWeeks, state.sessions, today)

  // Viewed week for the schedule grid (0 = current, negative = past)
  const viewMonday = addDays(weekKeyToMonday(currentWeekKey), weekOffset * 7)
  const viewWeekKey = isoWeekKey(viewMonday)
  const viewProgramWeek = computeProgramWeek(state.startDate, state.skippedWeeks, viewMonday)
  const viewSchedule = scheduleFor(viewProgramWeek)
  const startWeekKey = isoWeekKey(keyToDate(state.startDate))
  const canGoBack = viewWeekKey > startWeekKey

  // ── E-ink layout: simplified, large, text-first, no colour grid ──────────────
  if (einkMode) {
    const thisMonday = weekKeyToMonday(currentWeekKey)
    const isTodayGym = todayActivity === 'gym-a' || todayActivity === 'gym-b'
    return (
      <div>
        <div className="card">
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            WEEK {programWeek} / 26 · PHASE {phaseFor(programWeek).phase}
          </div>
          <div className="muted" style={{ fontSize: 13 }}>{phaseLabel}</div>
        </div>

        <div className="card">
          <div className="card-title">Today</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>
            {activityLabel(todayDisplayActivity)}{todaySession?.done ? ' ✓' : ''}
          </div>
          {isTodayGym && !todaySession?.done && (
            <button className="btn btn-primary w-full" onClick={() => onNavigate('workout')}>
              Open Workout {todayActivity === 'gym-a' ? 'A' : 'B'}
            </button>
          )}
          {(todayActivity === 'bike' || todayActivity === 'run') && !todaySession?.done && (
            <button className="btn btn-secondary w-full" onClick={() => dispatch({ type: 'MARK_DAY_DONE', date: todayStr, workout: todayActivity })}>
              Mark {activityLabel(todayActivity)} done
            </button>
          )}
          {todayActivity === 'rest' && !todaySession?.done && (
            <button className="btn btn-secondary w-full" onClick={() => dispatch({ type: 'MARK_DAY_DONE', date: todayStr, workout: 'rest' })}>
              Mark rest day
            </button>
          )}
          {todaySession?.done && (
            <button className="btn btn-secondary w-full" onClick={() => dispatch({ type: 'UNMARK_DAY_DONE', date: todayStr })}>
              Undo
            </button>
          )}
        </div>

        {nextGym && nextGym.dateKey !== todayStr && (
          <div className="card">
            <div className="card-title">Next gym session</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Workout {nextGym.workout}</div>
            <div className="muted" style={{ fontSize: 14 }}>
              {nextGym.date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-title">This week</div>
          {DAY_KEYS.map((dk, i) => {
            const cellKey = dateKey(addDays(thisMonday, i))
            const sess = state.sessions[cellKey]
            const act = sess ? sessionActivity(sess.workout) : schedule[dk]
            const isToday = cellKey === todayStr
            return (
              <div
                key={dk}
                style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '8px 0', borderBottom: '1px solid var(--border)',
                  fontWeight: isToday ? 700 : 400, fontSize: 15,
                }}
              >
                <span>{DAY_LABELS[i]}{isToday ? ' (today)' : ''}</span>
                <span>{activityLabel(act)}{sess?.done ? ' ✓' : ''}</span>
              </div>
            )
          })}
        </div>

        {isSkipped && (
          <div className="card">
            <span className="muted">This week is marked skipped.</span>
            <button className="btn btn-secondary w-full mt-8" onClick={() => dispatch({ type: 'UNSKIP_WEEK', weekKey: currentWeekKey })}>
              Undo skip
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Phase + week */}
      <div className="card">
        <div className="row gap-8 mb-8">
          <span className="badge badge-accent">Phase {phaseFor(programWeek).phase} - {phaseLabel}</span>
          <span className="badge badge-muted">Week {programWeek} / 26</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Start: {state.startDate}
          {isSkipped && <span style={{ color: 'var(--red)', marginLeft: 8 }}>This week skipped</span>}
        </div>
      </div>

      {/* Next gym session */}
      {nextGym && (
        <div className="card">
          <div className="card-title">Next gym session</div>
          <div className="row gap-8 mb-8" style={{ alignItems: 'baseline' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: nextGym.workout === 'A' ? 'var(--accent)' : 'var(--blue)' }}>
              Workout {nextGym.workout}
            </span>
            <span className="muted" style={{ fontSize: 13 }}>· Week {nextGym.programWeek}</span>
          </div>
          <div style={{ fontSize: 14, marginBottom: 10 }}>
            {nextGym.dateKey === todayStr
              ? 'Today'
              : nextGym.date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>
          {nextGym.dateKey === todayStr && (
            <button className="btn btn-primary btn-sm" onClick={() => onNavigate('workout')}>
              Go to workout →
            </button>
          )}
        </div>
      )}

      {/* Today's activity */}
      <div className="card">
        <div className="card-title">Today</div>
        <div className="row gap-8 mb-8">
          <span style={{ fontSize: 20, fontWeight: 700, color: activityColor(todayDisplayActivity) }}>
            {activityLabel(todayDisplayActivity)}
          </span>
          {todaySession?.done && <span className="badge badge-green">Done</span>}
        </div>
        {todayActivity === 'gym-a' && !todaySession?.done && (
          <button className="btn btn-primary" onClick={() => onNavigate('workout')}>
            Log Workout A
          </button>
        )}
        {todayActivity === 'gym-b' && !todaySession?.done && (
          <button className="btn btn-primary" onClick={() => onNavigate('workout')}>
            Log Workout B
          </button>
        )}
        {(todayActivity === 'bike' || todayActivity === 'run') && !todaySession?.done && (
          <button
            className="btn btn-secondary"
            onClick={() => dispatch({ type: 'MARK_DAY_DONE', date: todayStr, workout: todayActivity })}
          >
            Mark {activityLabel(todayActivity)} done
          </button>
        )}
        {todayActivity === 'rest' && !todaySession?.done && (
          <button
            className="btn btn-secondary"
            onClick={() => dispatch({ type: 'MARK_DAY_DONE', date: todayStr, workout: 'rest' })}
          >
            Mark rest day
          </button>
        )}
        {todaySession?.done && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => dispatch({ type: 'UNMARK_DAY_DONE', date: todayStr })}
          >
            Undo
          </button>
        )}
      </div>

      {/* Weekly schedule */}
      <div className="card">
        <div className="row gap-8 mb-8" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            className="btn btn-secondary btn-sm"
            disabled={!canGoBack}
            onClick={() => setWeekOffset(o => o - 1)}
          >
            ‹
          </button>
          <span className="card-title" style={{ margin: 0 }}>
            {weekOffset === 0 ? "This week" : `Week of ${dateKey(viewMonday)}`}
            <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>(wk {viewProgramWeek})</span>
          </span>
          <button
            className="btn btn-secondary btn-sm"
            disabled={weekOffset >= 0}
            onClick={() => setWeekOffset(o => o + 1)}
          >
            ›
          </button>
        </div>
        <div className="schedule-grid">
          {DAY_KEYS.map((dk, i) => {
            const cellKey = dateKey(addDays(viewMonday, i))
            const sess = state.sessions[cellKey]
            const act = sess ? sessionActivity(sess.workout) : viewSchedule[dk]
            const isToday = cellKey === todayStr
            return (
              <div key={dk} className={`sched-day${isToday ? ' today' : ''}`}>
                <span className="day-name">{DAY_LABELS[i]}</span>
                <span className="day-act" style={{ color: activityColor(act) }}>{activityBadge(act)}</span>
                {sess?.done && <span className="day-done">✓</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Skip week control */}
      <div className="card">
        <div className="card-title">This week</div>
        {isSkipped ? (
          <div className="col">
            <span className="muted">Week marked as skipped - does not count toward program week.</span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => dispatch({ type: 'UNSKIP_WEEK', weekKey: currentWeekKey })}
            >
              Undo skip
            </button>
          </div>
        ) : (
          <button
            className="btn btn-secondary"
            onClick={() => dispatch({ type: 'SKIP_WEEK', weekKey: currentWeekKey })}
          >
            I didn't train this week
          </button>
        )}
      </div>
    </div>
  )
}
