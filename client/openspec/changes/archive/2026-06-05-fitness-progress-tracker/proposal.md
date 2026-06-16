## Why

A static PDF describes a 6-month gym + bike/run plan but offers no way to log what was actually done, track weights over time, or know which workout is due today. A focused web app turns the plan into a living tracker: log every set, follow video tutorials, see progression suggestions, and keep the habit visible. All data stays local to the user's browser.

## What Changes

- New React + Vite single-page app, no backend. All state persisted to `LocalStorage`.
- Seed the app with the plan's two workouts (A: Push & Hinge, B: Pull & Quad), their exercises, set/rep targets, alternatives, notes, and the Phase 2 Face Pull addition.
- Each exercise links to a video tutorial.
- Per-set logging: kg, reps, and optional reps-in-reserve (RPE proxy) for each set of each exercise in a session.
- Mark a training day "done" with one tap; show the previous session's weights inline while logging.
- Auto progression hints: suggest the next weight per exercise from the last log plus a "felt easy" flag, using the plan's progression rules (dumbbell +1-2 kg, leg press +5-10 kg, RDL +2.5 kg, cable +2.5-5 kg).
- Phase/week awareness driven by **completed training weeks**, not the calendar. The app derives the current phase (1-3) and the correct weekly schedule (Gym A/B, Bike/Run, Rest) and surfaces today's prescribed activity.
- "I didn't train this week" / skip-week control: a skipped week does not advance the program week, so the phase schedule stays aligned with actual training.
- Body metrics log: bodyweight, sleep hours, protein grams - tied to the plan's recovery/testosterone levers.
- Safety cues (back & knee rules) surfaced on relevant exercises; 6-month milestone progress (e.g. Leg Press ~2x start).
- JSON export/import for backup and restore, since LocalStorage can be cleared.

## Capabilities

### New Capabilities

- `workout-catalog`: The static plan data - workouts, exercises, targets, alternatives, notes, video links, and safety cues - exposed to the app.
- `session-logging`: Recording a training session: per-set kg/reps/RIR, marking a day done, and viewing previous-session reference.
- `progression-guidance`: Suggesting the next working weight per exercise from history and the plan's progression rules.
- `phase-scheduling`: Deriving current phase, program week, and today's prescribed activity from completed training weeks, including skip-week handling.
- `body-metrics`: Logging bodyweight, sleep, and protein over time.
- `milestones-safety`: Surfacing safety rules per exercise and tracking 6-month milestone progress.
- `data-persistence`: LocalStorage persistence plus JSON export/import for backup and restore.

### Modified Capabilities

<!-- None - greenfield app, no existing specs. -->

## Impact

- New project: React + Vite app (new `package.json`, source tree, build config).
- New dependency surface: React, Vite, and minimal supporting libraries only.
- No backend, no auth, no network calls at runtime - data is local-only.
- Browser `LocalStorage` is the system of record; export/import mitigates data-loss risk.
