export const SCHEMA_VERSION = 2

export type WorkoutType = 'A' | 'B' | 'bike' | 'run' | 'rest'

export type ProgressionType = 'dumbbell' | 'legPress' | 'rdl' | 'cable' | 'bodyweight' | 'timed'

export interface SetEntry {
  kg?: number
  reps?: number
  seconds?: number
  rir?: number // reps in reserve
}

export interface ExerciseEntry {
  sets: SetEntry[]
  feltEasy: boolean
}

export interface Session {
  workout: WorkoutType
  done: boolean
  entries: Record<string, ExerciseEntry> // exerciseId -> entry
}

export interface DayMetric {
  bodyweightKg?: number
  sleepHrs?: number
  proteinG?: number
}

export interface AppState {
  schemaVersion: number
  startDate: string | null // ISO date e.g. "2026-06-05"
  skippedWeeks: string[] // ISO week keys e.g. "2026-W23"
  sessions: Record<string, Session> // keyed by ISO date
  metrics: Record<string, DayMetric> // keyed by ISO date
  milestones: Record<string, boolean> // milestone id -> achieved
}

export const EMPTY_STATE: AppState = {
  schemaVersion: SCHEMA_VERSION,
  startDate: null,
  skippedWeeks: [],
  sessions: {},
  metrics: {},
  milestones: {},
}

export type Tab = 'home' | 'workout' | 'metrics' | 'milestones' | 'history' | 'settings'
