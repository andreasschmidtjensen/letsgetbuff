import { ExerciseDef, SetEntry, Session, repTargetFor } from '@letsgetbuff/shared'

// Pure helpers shared by the WorkoutView subtree (timers, logger, focus mode).
// Extracted from the former single WorkoutView.tsx so the God file could split.

// "45s", "10 min", or "1:30" — friendly label for a duration in seconds.
export function formatDuration(secs: number): string {
  if (secs >= 60) {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return s === 0 ? `${m} min` : `${m}:${s.toString().padStart(2, '0')}`
  }
  return `${secs}s`
}

export interface WarmupStep { label: string; seconds: number; videoId?: string; vertical?: boolean }

// Form videos for non-cardio warmup steps, matched by label keyword. Cardio
// steps (elliptical/rowing) need no demo.
const WARMUP_VIDEOS: Array<{ pattern: RegExp; videoId: string; vertical?: boolean }> = [
  { pattern: /reverse plank/i, videoId: 'hS_KCFjbWKQ', vertical: true }, // Bharti Yoga
]

// One warmup part ("10-minute elliptical", "30-second plank") → label + duration.
// Understands minutes and seconds; defaults to 5 min if no number.
function parseWarmupPart(text: string): WarmupStep {
  const video = WARMUP_VIDEOS.find(v => v.pattern.test(text))
  const extra = video ? { videoId: video.videoId, vertical: video.vertical } : undefined
  const sec = text.match(/(\d+)\s*-?\s*s(?:ec)/i)
  if (sec) return { label: text, seconds: Math.max(10, parseInt(sec[1], 10)), ...extra }
  const min = text.match(/(\d+)\s*-?\s*min/i)
  const minutes = min ? parseInt(min[1], 10) : 5
  return { label: text, seconds: Math.max(30, minutes * 60), ...extra }
}

// A "2x 30-second reverse plank" part expands into two identical steps, each
// its own timed slide, labelled with a set counter.
function expandPart(text: string): WarmupStep[] {
  const m = text.match(/^(\d+)\s*[x×]\s*(.+)$/i)
  if (!m) return [parseWarmupPart(text)]
  const n = Math.max(1, parseInt(m[1], 10))
  const base = parseWarmupPart(m[2])
  if (n === 1) return [base]
  return Array.from({ length: n }, (_, i) => ({ ...base, label: `${base.label} (${i + 1}/${n})` }))
}

// Parse a free-text warmup ("10-minute elliptical, then 2x 30-second reverse
// plank") into timed steps, each run as its own warm-up slide in focus mode.
// Steps are separated by ", then" / "then" / "+".
export function parseWarmup(raw: string | undefined): WarmupStep[] | null {
  const text = raw?.trim()
  if (!text) return null
  const parts = text.split(/\s*(?:,\s*then\b|\bthen\b|\+|,)\s*/i).filter(Boolean)
  if (parts.length === 0) return null
  return parts.flatMap(expandPart)
}

export function lastSessionBefore(
  state: { sessions: Record<string, Session> },
  exerciseId: string,
  beforeDate: string
): { date: string; sets: SetEntry[]; feltEasy: boolean } | null {
  const dates = Object.keys(state.sessions).filter(d => d < beforeDate).sort().reverse()
  for (const date of dates) {
    const entry = state.sessions[date].entries[exerciseId]
    if (entry) return { date, ...entry }
  }
  return null
}

// Is this exercise fully logged for the given day in the given sessions blob?
// Mirrors the `confirmed` initialisation inside ExerciseLogger.
export function exerciseDoneIn(
  sessions: Record<string, Session>,
  dateStr: string,
  ex: ExerciseDef,
  programWeek: number,
): boolean {
  const target = repTargetFor(ex, programWeek)
  const logged = sessions[dateStr]?.entries[ex.id]?.sets ?? []
  const doneCount = logged.filter(s => s.reps !== undefined || s.seconds !== undefined).length
  return doneCount >= target.sets
}

export function formatSet(s: SetEntry, ex: ExerciseDef): string {
  const parts: string[] = []
  if (ex.requiresKg && s.kg !== undefined) parts.push(`${s.kg}kg`)
  if (s.reps !== undefined) parts.push(`x${s.reps}`)
  else if (s.seconds !== undefined) parts.push(`${s.seconds}s`)
  return parts.join(' ') || '-'
}

export function deltaLabel(
  current: SetEntry,
  prev: SetEntry | undefined,
  ex: ExerciseDef
): { text: string; positive: boolean } | null {
  if (!prev) return null
  if (ex.requiresKg && current.kg !== undefined && prev.kg !== undefined) {
    const d = current.kg - prev.kg
    if (d === 0) return null
    return { text: `${d > 0 ? '+' : ''}${d}kg`, positive: d > 0 }
  }
  if (!ex.requiresKg && current.reps !== undefined && prev.reps !== undefined) {
    const d = current.reps - prev.reps
    if (d === 0) return null
    return { text: `${d > 0 ? '+' : ''}${d} reps`, positive: d > 0 }
  }
  return null
}
