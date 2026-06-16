## Context

Single-user, local-only progress tracker for a fixed 6-month plan. No backend, no auth, no multi-device sync. The plan's structure (workouts, exercises, phases, schedules, progression rules) is static and known up front. The only dynamic data is what the user logs. The defining constraint from the user is that the **program week advances by completed training weeks, not the calendar** - a skipped week must not push the phase forward.

## Goals / Non-Goals

**Goals:**
- Fast daily flow: open app → see today's prescribed activity → log sets or mark done in a few taps.
- Correct phase/week derivation that respects skipped weeks.
- Resilient local data: autosave + JSON export/import.
- Zero-friction hosting: static build, deployable to any static host or run locally.

**Non-Goals:**
- No server, accounts, or cloud sync.
- No bike/run distance/duration logging (excluded by the user).
- No editing the plan structure itself in-app (catalog is static seed data).
- No charts library requirement; simple visual trends are enough.

## Decisions

### Stack: React + Vite, TypeScript
React + Vite per user choice. TypeScript for a typed data model (sessions, sets, metrics) since the schema versioning and progression logic benefit from compile-time checks. Alternative considered: single HTML file - rejected per user's stack choice.

### State management: single store + reducer, persisted
Hold all app state in one root store (React context + `useReducer`, or Zustand) and persist the whole tree to one LocalStorage key on every mutation. Rationale: the dataset is tiny (one user, ~26 weeks) so whole-tree serialization is cheap and avoids partial-write bugs. Alternative: one key per entity - rejected as needless complexity.

### Week identity: ISO week keyed off start date
A "training week" is identified by ISO week (year + week number). The plan start date anchors program week 1. Program week = count of elapsed ISO weeks from start that are **not** in the skipped set, capped at 26. This makes skip handling a set-membership check rather than date math on every render.

### Phase/schedule as pure functions of program week
`phaseFor(week)` and `scheduleFor(week)` are pure lookup functions over the ranges in the spec (1-4, 5-16, 17-26; plus the wk-13 Saturday-ride and wk-9 Face-Pull rules). Keeping them pure makes them directly testable against the spec scenarios.

### Catalog as typed constant
Workouts, exercises, targets, alternatives, notes, video URLs, and per-exercise safety-cue tags live in a typed constant module seeded from the PDF. Exercises carry a `progressionType` (`dumbbell` | `legPress` | `rdl` | `cable` | `bodyweight`) that drives both increment suggestions and whether a kg field is required.

### Progression as pure function
`suggestNextWeight(exercise, history)` reads the last session's weight and felt-easy flag and applies the increment table. Never suggests a decrease. RDL fixed at +2.5 kg. Returns null when no history.

### Video tutorial URLs (extracted from the plan PDF)
The plan PDF's "click for tutorial" links are the source of truth. Seed the catalog with these exact URLs:

| Exercise | URL |
|---|---|
| Dumbbell Lunge | https://www.youtube.com/shorts/Rkkc-FnURyc |
| Dumbbell Bench Press | https://www.youtube.com/shorts/1V3vpcaxRYQ |
| Romanian Deadlift (RDL) | https://www.youtube.com/watch?v=amLSSb8cXok |
| Seated Shoulder Press | https://www.youtube.com/shorts/2D0TyoHv_EY |
| Plank | https://www.youtube.com/shorts/hoeNgjheDHk |
| Leg Press | https://www.youtube.com/shorts/nDh_BlnLCGc |
| Back Extension Machine | https://www.youtube.com/shorts/P489_62b8JU |
| Lat Pulldown | https://www.youtube.com/shorts/jULa7guhCdM |
| Dumbbell Curl | https://www.youtube.com/shorts/PuaJzTatIJM |
| Tricep Pushdown | https://www.youtube.com/shorts/aHfbuBf1TJk |
| Bird Dog | https://www.youtube.com/shorts/-f8OZr1IdTM |
| Face Pull (cable) | https://www.youtube.com/shorts/MChHOiaCR7s |

### Data model (sketch)
```
AppState {
  schemaVersion: number
  startDate: ISODate
  skippedWeeks: string[]            // ISO week keys "2026-W23"
  sessions: {                        // keyed by date
    [date]: { workout: 'A'|'B'|'bike'|'rest', done: boolean,
              entries: { [exerciseId]: { sets: {kg?,reps?,seconds?}[], feltEasy: boolean } } }
  }
  metrics: { [date]: { bodyweightKg?, sleepHrs?, proteinG? } }
  milestones: { [id]: boolean }
}
```

## Risks / Trade-offs

- **LocalStorage wipe loses everything** → JSON export/import; prompt periodic backup.
- **Whole-tree write on every change** → dataset is tiny; debounce writes if it ever matters.
- **Skipped-week logic confusing if user back-dates** → recompute program week deterministically from startDate + skip set on every load; expose computed week in UI so it's never hidden.
- **Schema evolves later** → `schemaVersion` field + load-time check that refuses to overwrite good data with an unrecognized version.
- **Video URLs rot** → store as data in the catalog so they're editable in one place.

## Migration Plan

Greenfield - no migration. Deploy as a static build (`vite build` → `dist/`), hostable on any static host or openable via a local preview server. Rollback = redeploy previous build; user data is untouched in their browser.

## Open Questions

- None blocking. Tutorial URLs are resolved (extracted from the PDF, table above). Trend visualization defaults to inline SVG sparklines with no chart dependency.
