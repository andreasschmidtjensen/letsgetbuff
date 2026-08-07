import type { Session } from '../types.js'
import { keyToDate, addDays } from '../lib/date.js'
import { hasRealSet } from './history.js'

// ISO week key: "2026-W23"
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7 // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

// Parse ISO week key back to the Monday of that week, as a LOCAL Date at noon.
export function weekKeyToMonday(key: string): Date {
  const [year, w] = key.split('-W').map(Number)
  const jan4 = new Date(Date.UTC(year, 0, 4)) // Jan 4 is always in week 1
  const day = jan4.getUTCDay() || 7
  const weekStart = new Date(jan4)
  weekStart.setUTCDate(jan4.getUTCDate() - (day - 1) + (w - 1) * 7)
  return new Date(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate(), 12)
}

// Only a real gym session — Workout A or B — advances the program week. Home
// workouts, stretches, runs and rides are still tracked (AppState.activities /
// stretchSessions) but are deliberately not training weeks for the plan: the
// phase schedule is built around the two barbell/dumbbell days.
// A session counts once it is marked done, or as soon as any set carries a real
// rep/second value (`hasRealSet`), so a session left unmarked at the end of a
// workout still counts.
export function isGymTraining(session: Session): boolean {
  if (session.workout !== 'A' && session.workout !== 'B') return false
  if (session.done) return true
  return Object.values(session.entries).some(hasRealSet)
}

// ISO week keys in which at least one gym session was trained.
export function trainedWeekKeys(sessions: Record<string, Session>): Set<string> {
  const keys = new Set<string>()
  for (const [date, session] of Object.entries(sessions)) {
    if (isGymTraining(session)) keys.add(isoWeekKey(keyToDate(date)))
  }
  return keys
}

// Compute program week, capped at 26. Elapsed weeks before the current one count
// only if they contain a gym session and are not in skippedWeeks; the week you
// are currently in always counts (it is the week you are training in now) unless
// explicitly marked skipped. The counter therefore never runs ahead of actual
// training, and never moves backwards.
export function computeProgramWeek(
  startDate: string,
  skippedWeeks: string[],
  sessions: Record<string, Session>,
  today: Date,
): number {
  const startKey = isoWeekKey(keyToDate(startDate))
  const todayWeekKey = isoWeekKey(today)

  let current = weekKeyToMonday(startKey)
  const skippedSet = new Set(skippedWeeks)
  const trained = trainedWeekKeys(sessions)
  let count = 0

  let key = isoWeekKey(current)
  while (key < todayWeekKey && count < 26) {
    if (!skippedSet.has(key) && trained.has(key)) count++
    current = addDays(current, 7)
    key = isoWeekKey(current)
  }

  if (key === todayWeekKey && !skippedSet.has(todayWeekKey)) count++

  return Math.max(1, Math.min(26, count))
}

export type Phase = 1 | 2 | 3
export type PhaseLabel = 'Foundation' | 'Build' | 'Consolidate'

export function phaseFor(week: number): { phase: Phase; label: PhaseLabel } {
  if (week <= 4) return { phase: 1, label: 'Foundation' }
  if (week <= 16) return { phase: 2, label: 'Build' }
  return { phase: 3, label: 'Consolidate' }
}

export type DayActivity = 'gym-a' | 'gym-b' | 'bike' | 'run' | 'rest'

export interface WeekSchedule {
  mon: DayActivity
  tue: DayActivity
  wed: DayActivity
  thu: DayActivity
  fri: DayActivity
  sat: DayActivity
  sun: DayActivity
}

// Weekday index: 0=Mon..6=Sun
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type DayName = typeof DAYS[number]

// The calendar plan prescribes only the core gym days. Runs, rides and stretch
// sessions are user-added activities (AppState.activities), not scheduled here.
export function scheduleFor(_week: number): WeekSchedule {
  return { mon: 'rest', tue: 'gym-a', wed: 'rest', thu: 'rest', fri: 'rest', sat: 'gym-b', sun: 'rest' }
}

export function todayDayName(date: Date): DayName {
  const jsDay = date.getDay() // 0=Sun..6=Sat
  const idx = jsDay === 0 ? 6 : jsDay - 1 // convert to Mon=0..Sun=6
  return DAYS[idx]
}

export function activityLabel(activity: DayActivity): string {
  switch (activity) {
    case 'gym-a': return 'Workout A'
    case 'gym-b': return 'Workout B'
    case 'bike': return 'Bike / Run'
    case 'run': return 'Run'
    case 'rest': return 'Rest'
  }
}

// Stretch days are no longer prescribed (they were Mon/Wed/Fri until schema v4);
// stretching is user-added like runs and rides, and logged in stretchSessions.
