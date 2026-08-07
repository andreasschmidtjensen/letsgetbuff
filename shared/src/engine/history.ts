// Derived facts about what the user has actually logged, as opposed to what the
// calendar or the plan prescribes.

import type { ExerciseEntry, Session } from '../types.js'

// The repo-wide notion of "a real logged set": a set carrying an actual rep
// count or hold duration. ExerciseLogger prefills kg from the weight suggestion
// before anything is confirmed, so a weight on its own is not training. Mirrors
// `exerciseDoneIn` in the client's workout helpers.
export function hasRealSet(entry: ExerciseEntry): boolean {
  return entry?.sets?.some(s => s && (s.reps !== undefined || s.seconds !== undefined)) === true
}

// Every exercise id the user has ever really logged, across all dates. Used to
// override the plan's `minWeek` onboarding ramp — see `getWorkoutExercises`.
//
// Global, not as-of-date: the plan is always the current plan for every viewed
// date (side-plank and standing-calf-raise, added in plan v3, show up on
// back-dated sessions too), and an as-of-date set would hide an exercise on the
// very day it was trained, which reads as data loss.
//
// The optional chaining is deliberate: this walks every historical entry,
// including ones from old imported backups, not just well-formed gym sessions.
export function loggedExerciseIds(sessions: Record<string, Session>): Set<string> {
  const ids = new Set<string>()
  for (const session of Object.values(sessions)) {
    for (const [id, entry] of Object.entries(session.entries ?? {})) {
      if (hasRealSet(entry)) ids.add(id)
    }
  }
  return ids
}
