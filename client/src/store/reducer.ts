import { AppState, Session, DayMetric, ExerciseEntry, SetEntry, StretchEntry, StretchSession } from '@letsgetbuff/shared'

export type Action =
  | { type: 'SET_START_DATE'; date: string }
  | { type: 'SKIP_WEEK'; weekKey: string }
  | { type: 'UNSKIP_WEEK'; weekKey: string }
  | { type: 'MARK_DAY_DONE'; date: string; workout: Session['workout'] }
  | { type: 'UNMARK_DAY_DONE'; date: string }
  | { type: 'LOG_EXERCISE'; date: string; exerciseId: string; entry: ExerciseEntry }
  | { type: 'LOG_SET'; date: string; exerciseId: string; setIndex: number; set: SetEntry }
  | { type: 'SET_METRIC'; date: string; metric: Partial<DayMetric> }
  | { type: 'SET_MILESTONE'; id: string; achieved: boolean }
  | { type: 'LOG_STRETCH'; date: string; sessionId: string; stretchId: string; entry: StretchEntry }
  | { type: 'MARK_STRETCH_DONE'; date: string; sessionId: string }
  | { type: 'UNMARK_STRETCH_DONE'; date: string }
  | { type: 'SET_STRETCH_SCHEDULE'; enabled: boolean }
  | { type: 'REPLACE_STATE'; state: AppState }

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_START_DATE':
      return { ...state, startDate: action.date }

    case 'SKIP_WEEK':
      if (state.skippedWeeks.includes(action.weekKey)) return state
      return { ...state, skippedWeeks: [...state.skippedWeeks, action.weekKey] }

    case 'UNSKIP_WEEK':
      return { ...state, skippedWeeks: state.skippedWeeks.filter(k => k !== action.weekKey) }

    case 'MARK_DAY_DONE': {
      const existing = state.sessions[action.date] ?? { workout: action.workout, done: false, entries: {} }
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [action.date]: { ...existing, workout: action.workout, done: true },
        },
      }
    }

    case 'UNMARK_DAY_DONE': {
      const existing = state.sessions[action.date]
      if (!existing) return state
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [action.date]: { ...existing, done: false },
        },
      }
    }

    case 'LOG_EXERCISE': {
      const session = state.sessions[action.date] ?? { workout: 'A', done: false, entries: {} }
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [action.date]: {
            ...session,
            entries: { ...session.entries, [action.exerciseId]: action.entry },
          },
        },
      }
    }

    case 'LOG_SET': {
      const session = state.sessions[action.date] ?? { workout: 'A', done: false, entries: {} }
      const entry = session.entries[action.exerciseId] ?? { sets: [], feltEasy: false }
      const sets = [...entry.sets]
      sets[action.setIndex] = action.set
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [action.date]: {
            ...session,
            entries: {
              ...session.entries,
              [action.exerciseId]: { ...entry, sets },
            },
          },
        },
      }
    }

    case 'SET_METRIC': {
      const existing = state.metrics[action.date] ?? {}
      return {
        ...state,
        metrics: {
          ...state.metrics,
          [action.date]: { ...existing, ...action.metric },
        },
      }
    }

    case 'SET_MILESTONE':
      return { ...state, milestones: { ...state.milestones, [action.id]: action.achieved } }

    case 'LOG_STRETCH': {
      const session: StretchSession =
        state.stretchSessions[action.date] ?? { done: false, sessionId: action.sessionId, entries: {} }
      return {
        ...state,
        stretchSessions: {
          ...state.stretchSessions,
          [action.date]: {
            ...session,
            sessionId: action.sessionId,
            entries: { ...session.entries, [action.stretchId]: action.entry },
          },
        },
      }
    }

    case 'MARK_STRETCH_DONE': {
      const session: StretchSession =
        state.stretchSessions[action.date] ?? { done: false, sessionId: action.sessionId, entries: {} }
      return {
        ...state,
        stretchSessions: {
          ...state.stretchSessions,
          [action.date]: { ...session, sessionId: action.sessionId, done: true },
        },
      }
    }

    case 'UNMARK_STRETCH_DONE': {
      const existing = state.stretchSessions[action.date]
      if (!existing) return state
      return {
        ...state,
        stretchSessions: {
          ...state.stretchSessions,
          [action.date]: { ...existing, done: false },
        },
      }
    }

    case 'SET_STRETCH_SCHEDULE':
      return { ...state, stretchSchedule: { enabled: action.enabled } }

    case 'REPLACE_STATE':
      return action.state

    default:
      return state
  }
}
