import { keyToDate, addDays } from '../lib/date.js'

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

// Compute program week: count of elapsed ISO weeks from startDate not in skippedWeeks, capped at 26
export function computeProgramWeek(startDate: string, skippedWeeks: string[], today: Date): number {
  const startKey = isoWeekKey(keyToDate(startDate))
  const todayWeekKey = isoWeekKey(today)

  let current = weekKeyToMonday(startKey)
  const skippedSet = new Set(skippedWeeks)
  let count = 0

  let key = isoWeekKey(current)
  while (key <= todayWeekKey && count < 26) {
    if (!skippedSet.has(key)) count++
    current = addDays(current, 7)
    key = isoWeekKey(current)
  }

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
