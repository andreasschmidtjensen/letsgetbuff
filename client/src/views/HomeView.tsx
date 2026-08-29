import { useRef, useState } from 'react'
import { useStore } from '../store/store'
import { useEinkMode } from '../store/einkMode'
import { useUiVersion } from '../store/uiVersion'
import TodayCardV2, { WeekCell } from '../components/workout/v2/TodayCardV2'
import HomeWorkout from '../components/HomeWorkout'
import { preloadTimerSounds } from '../lib/sounds'
import { computeProgramWeek, phaseFor, scheduleFor, isoWeekKey, weekKeyToMonday, todayDayName, activityLabel, DayActivity, homeWorkoutMinutes } from '@letsgetbuff/shared'
import { dateKey, keyToDate, addDays } from '@letsgetbuff/shared'
import type { Tab, Session, ActivityEntry, ActivityType } from '@letsgetbuff/shared'

// Same key StretchView uses — one mute preference for all timer dings.
const MUTE_KEY = 'letsgetbuff-mute'

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
    const pw = computeProgramWeek(startDate, skippedWeeks, sessions, d)
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

function activityEntryLabel(a: ActivityEntry): string {
  const name = a.type === 'run' ? 'Run' : a.type === 'bike' ? 'Bike' : a.type === 'home' ? 'Home workout' : 'Stretch'
  return a.minutes ? `${name} ${a.minutes} min` : name
}

// "+ Add activity" — the calendar plan only prescribes gym days; runs, rides and
// stretch sessions are added here. Stretch routes to the Stretch tab (its own log).
function AddActivity({ date, onNavigate }: { date: string; onNavigate: (tab: Tab) => void }) {
  const { dispatch } = useStore()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<ActivityType>('run')
  const [minutes, setMinutes] = useState(30)

  if (!open) {
    return (
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
        + Add activity
      </button>
    )
  }
  return (
    <div className="row gap-8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <select
        className="input"
        style={{ width: 'auto' }}
        value={type}
        aria-label="Activity type"
        onChange={e => setType(e.target.value as ActivityType)}
      >
        <option value="run">Run</option>
        <option value="bike">Bike</option>
        <option value="home">Home workout</option>
        <option value="stretch">Stretch program</option>
      </select>
      {type !== 'stretch' && (
        <label className="row gap-4" style={{ alignItems: 'center', fontSize: 13 }}>
          <input
            type="number"
            className="input"
            style={{ width: 64 }}
            min={5}
            step={5}
            value={minutes}
            aria-label="Length in minutes"
            onChange={e => setMinutes(Math.max(1, Number(e.target.value) || 0))}
          />
          min
        </label>
      )}
      <button
        className="btn btn-primary btn-sm"
        onClick={() => {
          if (type === 'stretch') {
            onNavigate('stretch')
          } else {
            dispatch({ type: 'ADD_ACTIVITY', date, activity: { type, minutes } })
          }
          setOpen(false)
        }}
      >
        {type === 'stretch' ? 'Open stretch →' : 'Add'}
      </button>
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  )
}

export default function HomeView({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const { state, dispatch } = useStore()
  const { einkMode } = useEinkMode()
  const { v2 } = useUiVersion()
  const today = new Date()
  const todayStr = dateKey(today)
  const currentWeekKey = isoWeekKey(today)
  const [startInput, setStartInput] = useState(state.startDate ?? '')
  const [weekOffset, setWeekOffset] = useState(0)
  const [homeWorkoutOpen, setHomeWorkoutOpen] = useState(false)
  const audioCtxRef = useRef<AudioContext | null>(null)

  const isSkipped = state.skippedWeeks.includes(currentWeekKey)

  // Start the guided bodyweight circuit (issue #1). AudioContext must be
  // created inside the click gesture or mobile browsers keep it suspended.
  const startHomeWorkout = () => {
    preloadTimerSounds()
    if (!audioCtxRef.current) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctor) audioCtxRef.current = new Ctor()
    }
    setHomeWorkoutOpen(true)
  }

  const homeWorkoutOverlay = homeWorkoutOpen ? (
    <HomeWorkout
      audioCtx={audioCtxRef.current}
      muted={localStorage.getItem(MUTE_KEY) === '1'}
      onClose={() => setHomeWorkoutOpen(false)}
    />
  ) : null

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

  const programWeek = computeProgramWeek(state.startDate, state.skippedWeeks, state.sessions, today)
  const { label: phaseLabel } = phaseFor(programWeek)
  const schedule = scheduleFor(programWeek)
  const todayDay = todayDayName(today)
  const todayActivity = schedule[todayDay]
  const todaySession = state.sessions[todayStr]
  // What to display for "Today": the logged workout if one exists, else the scheduled activity
  const todayDisplayActivity = todaySession ? sessionActivity(todaySession.workout) : todayActivity
  const stretchDoneToday = Boolean(state.stretchSessions[todayStr]?.done)
  const todayActivities = state.activities[todayStr] ?? []
  const homeDoneToday = todayActivities.some(a => a.type === 'home')

  const nextGym = nextGymSession(state.startDate, state.skippedWeeks, state.sessions, today)

  // Viewed week for the schedule grid (0 = current, negative = past)
  const viewMonday = addDays(weekKeyToMonday(currentWeekKey), weekOffset * 7)
  const viewWeekKey = isoWeekKey(viewMonday)
  const viewProgramWeek = computeProgramWeek(state.startDate, state.skippedWeeks, state.sessions, viewMonday)
  const viewSchedule = scheduleFor(viewProgramWeek)
  const startWeekKey = isoWeekKey(keyToDate(state.startDate))
  const canGoBack = viewWeekKey > startWeekKey

  // ── E-ink layout: simplified, large, text-first, no colour grid ──────────────
  if (einkMode) {
    const thisMonday = weekKeyToMonday(currentWeekKey)
    const isTodayGym = todayActivity === 'gym-a' || todayActivity === 'gym-b'
    return (
      <div>
        {homeWorkoutOverlay}
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
          {todayActivities.map((a, i) => (
            <div key={i} className="row gap-8" style={{ alignItems: 'center', marginTop: 8, fontSize: 15 }}>
              <span>{activityEntryLabel(a)} ✓</span>
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginLeft: 'auto' }}
                aria-label={`Remove ${activityEntryLabel(a)}`}
                onClick={() => dispatch({ type: 'REMOVE_ACTIVITY', date: todayStr, index: i })}
              >
                ×
              </button>
            </div>
          ))}
          <div className="mt-8">
            <AddActivity date={todayStr} onNavigate={onNavigate} />
          </div>
          <button className="btn btn-secondary w-full mt-8" onClick={() => onNavigate('stretch')}>
            Stretch (optional){stretchDoneToday ? ' ✓' : ''}
          </button>
          <button className="btn btn-secondary w-full mt-8" onClick={startHomeWorkout}>
            Home workout ~{homeWorkoutMinutes()} min{homeDoneToday ? ' ✓' : ''}
          </button>
          {!isTodayGym && nextGym && (
            <button className="btn btn-secondary w-full mt-8" onClick={() => onNavigate('workout')}>
              Gym workout (next: {nextGym.workout}) →
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
            const extras = (state.activities[cellKey] ?? []).map(activityEntryLabel)
            if (state.stretchSessions[cellKey]?.done) extras.push('Stretch')
            return (
              <div
                key={dk}
                style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '8px 0', borderBottom: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontWeight: isToday ? 700 : 400, fontSize: 15,
                }}
              >
                <span>{DAY_LABELS[i]}{isToday ? ' (today)' : ''}</span>
                <span>
                  {activityLabel(act)}{sess?.done ? ' ✓' : ''}
                  {extras.length > 0 ? ` · ${extras.join(' · ')} ✓` : ''}
                </span>
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
    <div className="home-grid">
      {homeWorkoutOverlay}
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
      {v2 ? (
        <TodayCardV2
          dateCaption={today.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}
          title={activityLabel(todayDisplayActivity)}
          subtitle={todayActivity === 'gym-a' || todayActivity === 'gym-b' ? `Week ${programWeek} · ${phaseLabel}` : phaseLabel}
          estimate={todayActivity === 'gym-a' || todayActivity === 'gym-b' ? '~55 min' : undefined}
          done={Boolean(todaySession?.done)}
          primaryLabel={
            todayActivity === 'gym-a' || todayActivity === 'gym-b'
              ? `▶ Start Workout ${todayActivity === 'gym-a' ? 'A' : 'B'}`
              : todayActivity === 'rest' ? 'Mark rest day' : null
          }
          onPrimary={() => {
            if (todayActivity === 'rest') dispatch({ type: 'MARK_DAY_DONE', date: todayStr, workout: 'rest' })
            else onNavigate('workout')
          }}
          onUndo={() => dispatch({ type: 'UNMARK_DAY_DONE', date: todayStr })}
          stretchDone={stretchDoneToday}
          onStretch={() => onNavigate('stretch')}
          homeDone={homeDoneToday}
          homeMinutes={homeWorkoutMinutes()}
          onHome={startHomeWorkout}
          weekDoneLabel={`${DAY_KEYS.filter((_, i) => state.sessions[dateKey(addDays(weekKeyToMonday(currentWeekKey), i))]?.done).length} of ${DAY_KEYS.filter(dk => schedule[dk] === 'gym-a' || schedule[dk] === 'gym-b').length} done`}
          week={DAY_KEYS.map((dk, i): WeekCell => {
            const cellKey = dateKey(addDays(weekKeyToMonday(currentWeekKey), i))
            const sess = state.sessions[cellKey]
            const act = sess ? sessionActivity(sess.workout) : schedule[dk]
            const badge = activityBadge(act)
            return {
              initial: DAY_LABELS[i][0],
              marker: `${badge === '-' ? '·' : badge}${sess?.done ? ' ✓' : ''}`,
              isToday: cellKey === todayStr,
            }
          })}
          activities={todayActivities.map((a, i) => (
            <div key={i} className="row gap-8" style={{ alignItems: 'center', fontSize: 13 }}>
              <span>{activityEntryLabel(a)} ✓</span>
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginLeft: 'auto' }}
                aria-label={`Remove ${activityEntryLabel(a)}`}
                onClick={() => dispatch({ type: 'REMOVE_ACTIVITY', date: todayStr, index: i })}
              >
                ×
              </button>
            </div>
          ))}
          addActivity={<AddActivity date={todayStr} onNavigate={onNavigate} />}
        />
      ) : (
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
        {todayActivities.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {todayActivities.map((a, i) => (
              <div key={i} className="row gap-8" style={{ alignItems: 'center', fontSize: 14, marginBottom: 4 }}>
                <span style={{ color: 'var(--green)' }}>{activityEntryLabel(a)}</span>
                <span className="badge badge-green">Done</span>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ marginLeft: 'auto' }}
                  aria-label={`Remove ${activityEntryLabel(a)}`}
                  onClick={() => dispatch({ type: 'REMOVE_ACTIVITY', date: todayStr, index: i })}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 10 }}>
          <AddActivity date={todayStr} onNavigate={onNavigate} />
        </div>
        {!(todayActivity === 'gym-a' || todayActivity === 'gym-b') && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <div className="row gap-8" style={{ alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: nextGym?.workout === 'B' ? 'var(--blue)' : 'var(--accent)' }}>
                Gym workout{nextGym ? ` · next: ${nextGym.workout}` : ''}
              </span>
              <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => onNavigate('workout')}>Open &rarr;</button>
            </div>
          </div>
        )}
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <div className="row gap-8" style={{ alignItems: 'center' }}>
            <span style={{ fontSize: 14, color: 'var(--green)' }}>Stretch (optional)</span>
            {stretchDoneToday && <span className="badge badge-green">Done</span>}
            <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => onNavigate('stretch')}>Open &rarr;</button>
          </div>
        </div>
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <div className="row gap-8" style={{ alignItems: 'center' }}>
            <span style={{ fontSize: 14, color: 'var(--accent)' }}>Home workout · ~{homeWorkoutMinutes()} min, no equipment</span>
            {homeDoneToday && <span className="badge badge-green">Done</span>}
            <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => onNavigate('hometraining')}>Program &rarr;</button>
            <button className="btn btn-secondary btn-sm" onClick={startHomeWorkout}>Start &rarr;</button>
          </div>
        </div>
      </div>
      )}

      {/* Weekly schedule */}
      <div className="card card-wide">
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
                {(state.activities[cellKey] ?? []).map((a, ai) => (
                  <span key={ai} title={activityEntryLabel(a)} style={{ color: 'var(--green)', fontSize: 10, marginTop: 2 }}>
                    {a.type}{a.minutes ? ` ${a.minutes}′` : ''} ✓
                  </span>
                ))}
                {state.stretchSessions[cellKey]?.done && (
                  <span title="Stretching done" style={{ color: 'var(--green)', fontSize: 10, marginTop: 2 }}>
                    str ✓
                  </span>
                )}
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
