import {
  getPlan, computeProgramWeek, phaseFor, exerciseRepBand, todayKey,
  BAND2_FROM_SESSION, BAND3_FROM_SESSION, BAND_REGRESS_GAP_DAYS, BAND_REBUILD_SESSIONS,
  INCREMENTS, DELOAD_GAP_DAYS, DELOAD_FACTOR,
  kgCaption, describeLoadMode, describeExerciseChoice,
  HOME_WORKOUT, homeWorkoutMinutes, getHomeLevel, explainHomeLevel, describeHomeLevel,
  getStretchPlan, explainStretchLevel, STRETCH_EASY_STREAK, STRETCH_REBUILD_SESSIONS,
} from '@letsgetbuff/shared'
import type { ExerciseDef, ProgressionType, RepTarget } from '@letsgetbuff/shared'
import { useStore } from '../store/store'

/**
 * Program Guide — the whole training system explained in one read-only page.
 *
 * Everything renders from the same shared engine/catalog exports the app runs
 * on (INCREMENTS, DELOAD_*, exerciseRepBand, getPlan, rationale fields), so the
 * guide cannot drift from what the engine actually does. Deeper background
 * lives in design/training-theory.md in the repo.
 *
 * Guest-safe by construction: reads the store, never dispatches, no fetches.
 */

const INCREMENT_LABELS: Array<{ type: ProgressionType; what: string }> = [
  { type: 'dumbbell', what: 'Dumbbell lifts' },
  { type: 'cable', what: 'Cable stack (pulldown, face pull, Pallof)' },
  { type: 'rdl', what: 'Romanian deadlift (barbell)' },
  { type: 'legPress', what: 'Leg press' },
]

function formatTarget(t: RepTarget): string {
  const amount = t.reps !== undefined ? `${t.reps}` : `${t.seconds}s`
  return `${t.sets}x${amount}${t.addLoad ? ' +load' : ''}`
}

function bandRow(e: ExerciseDef): string {
  if (!e.repProgression) return `${formatTarget({ sets: e.sets, reps: e.reps ?? undefined, seconds: e.seconds })} (fixed)`
  const { band1, band2, band3 } = e.repProgression
  return `${formatTarget(band1)} → ${formatTarget(band2)} → ${formatTarget(band3)}`
}

export default function ProgramGuideView() {
  const { state } = useStore()
  const plan = getPlan()
  const today = todayKey()
  const programWeek = state.startDate
    ? computeProgramWeek(state.startDate, state.skippedWeeks, state.sessions, new Date())
    : 1
  const { label: phaseLabel } = phaseFor(programWeek)
  const bandInfo = (exerciseId: string) => exerciseRepBand(state.sessions, exerciseId, today)

  return (
    <div className="guide">
      <h2>Program guide</h2>
      <p className="muted guide-intro">
        How the plan decides your exercises, sets, reps and weights — generated
        from the same rules the app runs on.
      </p>

      <div className="card">
        <div className="card-title">Where you are</div>
        <p>
          Program week <strong>{programWeek}</strong> ({phaseLabel} phase).
        </p>
        <p className="muted guide-fine">
          The program week counts <strong>weeks you actually trained</strong>, not
          calendar weeks: a past week only counts if it contains a logged gym
          session and is not marked skipped. It drives the schedule and when new
          exercises join the plan (the Face Pull at week 9). Your sets and reps do
          NOT hang off it — they follow each exercise's own history, below.
        </p>
      </div>

      <div className="card">
        <div className="card-title">Sets &amp; reps: bands follow your training</div>
        <p className="muted guide-fine">
          Each exercise earns its rep band from <strong>how many times you have
          actually logged it</strong> — not from the calendar. Train twice a week
          and it advances twice as fast; skip a month and nothing moves. Most
          compound lifts trade reps for heavier sets as the count grows:
          <strong> 3x10</strong> (technique and work capacity)
          → <strong>3x8</strong> (more load, same volume)
          → <strong>4x6</strong> (strength emphasis). When an exercise enters a
          new band, add roughly 10% weight to match the lower reps — the "?&nbsp;Why"
          panel says so on the day it happens.
        </p>
        <table className="guide-table">
          <thead>
            <tr><th>Band</th><th>Your sessions of that exercise</th><th>Compound target</th></tr>
          </thead>
          <tbody>
            <tr><td>1</td><td>1-{BAND2_FROM_SESSION - 1}</td><td>3x10</td></tr>
            <tr><td>2</td><td>{BAND2_FROM_SESSION}-{BAND3_FROM_SESSION - 1}</td><td>3x8</td></tr>
            <tr><td>3</td><td>{BAND3_FROM_SESSION}+</td><td>4x6</td></tr>
          </tbody>
        </table>
        <p className="muted guide-fine">
          <strong>After a long break</strong> ({BAND_REGRESS_GAP_DAYS}+ days without
          an exercise) it runs one band lower — heavy low-rep sets are the wrong
          way back in. The earned band returns after {BAND_REBUILD_SESSIONS} sessions,
          not the eight it took originally.
        </p>
      </div>

      <div className="card">
        <div className="card-title">Weight: how the suggestion works</div>
        <ul className="guide-list">
          <li><strong>First time?</strong> No suggestion — pick a weight you can control for every rep; the next session builds on it.</li>
          <li><strong>Ticked "felt easy" last time?</strong> The suggestion adds one increment (table below). That tick means about two reps left in the tank.</li>
          <li><strong>Didn't tick it?</strong> Same weight as last time. Weight never drops on its own.</li>
          <li><strong>{DELOAD_GAP_DAYS}+ days since you last did the exercise?</strong> The suggestion deloads to about {Math.round(DELOAD_FACTOR * 100)}% of your last weight, then "felt easy" climbs back at the normal step.</li>
        </ul>
        <table className="guide-table">
          <thead>
            <tr><th>Equipment</th><th>"Felt easy" step</th></tr>
          </thead>
          <tbody>
            {INCREMENT_LABELS.map(({ type, what }) => (
              <tr key={type}><td>{what}</td><td>+{INCREMENTS[type]}kg</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-title">What the kg you type means</div>
        <p className="muted guide-fine">
          Some exercises log one dumbbell, some the pair, some the whole stack.
          The label next to each weight field says which — logged history keeps
          the meaning you gave it.
        </p>
        <table className="guide-table">
          <thead>
            <tr><th>Exercise</th><th>Label</th></tr>
          </thead>
          <tbody>
            {plan.workouts.flatMap(w => w.exercises).filter(e => e.requiresKg).map(e => (
              <tr key={e.id}>
                <td>{e.name}</td>
                <td title={describeLoadMode(e) ?? undefined}>{kgCaption(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {plan.workouts.map(w => (
        <div className="card" key={w.id}>
          <div className="card-title">Workout {w.id} — {w.name}: why each exercise</div>
          <p className="muted guide-fine">Warm-up: {w.warmup}</p>
          {w.exercises.map(e => {
            const info = bandInfo(e.id)
            return (
              <div className="guide-exercise" key={e.id}>
                <div className="guide-exercise-head">
                  <strong>{e.name}</strong>
                  <span className="muted">{bandRow(e)}</span>
                </div>
                {info.count > 0 && (
                  <p className="muted guide-fine">
                    You have logged it {info.count === 1 ? 'once' : `${info.count} times`} — band {info.band}
                    {info.regressed ? ` (held down by a ${info.regressed.gapDays}-day break; ${info.regressed.sessionsToRestore} more to restore band ${info.countBand})` : ''}.
                  </p>
                )}
                <p>{e.rationale?.purpose ?? describeExerciseChoice(e, programWeek)}</p>
                {e.rationale?.repScheme && <p className="muted guide-fine">{e.rationale.repScheme}</p>}
              </div>
            )
          })}
        </div>
      ))}

      <div className="card">
        <div className="card-title">Home circuit: harder variants, not longer intervals</div>
        <p className="muted guide-fine">
          ~{homeWorkoutMinutes()} min, {HOME_WORKOUT.rounds} rounds × {HOME_WORKOUT.exercises.length} exercises,
          {' '}{HOME_WORKOUT.workSeconds}s work / {HOME_WORKOUT.restSeconds}s rest. The six slots cover the
          gym's patterns — squat, push, single-leg, core brace, hinge — plus the conditioning the gym days
          don't do. It progresses by <strong>swapping in harder variants</strong>: tick "felt easy" when
          you finish, and two easy circuits in a row suggest the next one. A {BAND_REGRESS_GAP_DAYS}+ day
          break drops a variant one level; two circuits bring it back.
        </p>
        {HOME_WORKOUT.exercises.map(ex => {
          const info = explainHomeLevel(state, ex.id, today)
          return (
            <div className="guide-exercise" key={ex.id}>
              <div className="guide-exercise-head">
                <strong>{ex.name}</strong>
                <span className="muted">{ex.levels.map(l => l.name).join(' → ')}</span>
              </div>
              <p>{ex.purpose}</p>
              {info.count > 0 && (
                <p className="muted guide-fine">
                  Now: {getHomeLevel(ex, info.level).name}. {describeHomeLevel(info)}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <div className="card">
        <div className="card-title">Stretch program: flow first, then holds</div>
        <p className="muted guide-fine">
          Every session runs the <strong>movement flow first</strong> (active, full-range — it doubles as
          the gym-day warm-up) and the <strong>static holds after</strong>, on warm tissue. Each stretch has
          three levels: {STRETCH_EASY_STREAK} felt-easy sessions in a row at a level suggest the next one,
          a {BAND_REGRESS_GAP_DAYS}+ day break on a stretch drops it one level
          ({STRETCH_REBUILD_SESSIONS} sessions restore it — flexibility fades with disuse), and the
          ↓/↑ buttons override any day.
        </p>
        {getStretchPlan().routines.map(r => (
          <div key={r.id}>
            <p className="guide-fine" style={{ fontWeight: 600, margin: '10px 0 2px' }}>{r.name}</p>
            {r.stretches.map(s => {
              const info = explainStretchLevel(state, s.id, s.startLevel, today)
              return (
                <div className="guide-exercise" key={s.id}>
                  <div className="guide-exercise-head">
                    <strong>{s.name}</strong>
                    <span className="muted">
                      {info.count > 0 ? `level ${info.level}${info.regressed ? ' (break)' : ''}` : `starts at level ${s.startLevel}`}
                    </span>
                  </div>
                  <p>{s.purpose}</p>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <p className="muted guide-fine">
        The full review behind these choices — including what the plan could do
        differently — lives in <code>design/training-theory.md</code> in the repo.
      </p>
    </div>
  )
}
