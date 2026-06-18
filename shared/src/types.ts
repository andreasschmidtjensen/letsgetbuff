export const SCHEMA_VERSION = 3

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

// Stretch program (Phase 18). Optional, independently-logged stretching.

export type StretchLevelId = 1 | 2 | 3

export interface StretchEntry {
  holds: SetEntry[] // reuse SetEntry; seconds (and reps for flows). idx0=side1, idx1=side2
  level: StretchLevelId
  feltEasy: boolean
}

export interface StretchSession {
  done: boolean
  sessionId: string // session-plan id, e.g. 'daily' (flow then static)
  entries: Record<string, StretchEntry> // stretchId -> entry (spans both routines)
}

export interface StretchScheduleSettings {
  enabled: boolean
}

export interface AppState {
  schemaVersion: number
  startDate: string | null // ISO date e.g. "2026-06-05"
  skippedWeeks: string[] // ISO week keys e.g. "2026-W23"
  sessions: Record<string, Session> // keyed by ISO date
  stretchSessions: Record<string, StretchSession> // keyed by ISO date
  stretchSchedule: StretchScheduleSettings
  metrics: Record<string, DayMetric> // keyed by ISO date
  milestones: Record<string, boolean> // milestone id -> achieved
}

export const EMPTY_STATE: AppState = {
  schemaVersion: SCHEMA_VERSION,
  startDate: null,
  skippedWeeks: [],
  sessions: {},
  stretchSessions: {},
  stretchSchedule: { enabled: true },
  metrics: {},
  milestones: {},
}

export type Tab = 'home' | 'workout' | 'stretch' | 'metrics' | 'milestones' | 'history' | 'settings'

// Per-account privilege level (Phase 11). Lives in buff.db, never in CWA.
export type Privilege = 'none' | 'viewer' | 'user' | 'admin'
