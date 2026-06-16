## 1. Project setup

- [x] 1.1 Scaffold React + Vite + TypeScript project with package.json, tsconfig, and dev/build scripts
- [x] 1.2 Add minimal lint/format config and a basic app shell (header, nav, routes/tabs)
- [x] 1.3 Verify dev server runs and production build emits a static dist/

## 2. Data model and persistence

- [x] 2.1 Define typed AppState, Session, SetEntry, and Metric types with a schemaVersion constant
- [x] 2.2 Implement LocalStorage load/save with autosave-on-mutation and first-run empty init
- [x] 2.3 Implement JSON export (download) and import (validate + confirm + replace)
- [x] 2.4 Add schema-version check that safely rejects/migrates incompatible payloads
- [x] 2.5 Build the root store (context + reducer or Zustand) wiring state to persistence

## 3. Workout catalog (static seed)

- [x] 3.1 Encode Workout A and B with exercises, set/rep targets, alternatives, notes, and warmups
- [x] 3.2 Tag each exercise with progressionType and required-fields (kg vs reps/seconds)
- [x] 3.3 Attach the video tutorial URLs extracted from the PDF (see design.md URL table)
- [x] 3.4 Tag exercises with applicable back/knee safety cues
- [x] 3.5 Gate Face Pull into Workout B only when program week >= 9

## 4. Phase and schedule engine

- [x] 4.1 Implement ISO-week keying and program-week computation from startDate excluding skipped weeks (cap 26)
- [x] 4.2 Implement pure phaseFor(week) and scheduleFor(week) including wk-13 Saturday-ride rule
- [x] 4.3 Build start-date setup and the "I didn't train this week" skip/undo control
- [x] 4.4 Build the home view: current phase, program week, weekly schedule, and today's highlighted activity

## 5. Session logging

- [x] 5.1 Build per-exercise set logging UI (kg/reps/RIR rows matching prescribed set count)
- [x] 5.2 Pre-fill rows from the previous session and show previous-session reference values
- [x] 5.3 Support timed/bodyweight exercises without requiring kg
- [x] 5.4 Implement mark-day-done and undo for gym and non-gym days

## 6. Progression guidance

- [x] 6.1 Implement suggestNextWeight using increment table, felt-easy flag, no-decrease and RDL rules
- [x] 6.2 Add the felt-easy toggle to logging and surface the suggested next weight per exercise

## 7. Body metrics

- [x] 7.1 Build bodyweight/sleep/protein per-date entry with partial-save and edit-overwrite
- [x] 7.2 Build a metric history/trend view with the protein 130-150 g/day reference

## 8. Milestones and safety

- [x] 8.1 Surface safety cues on relevant exercises and the global key rule in logging views
- [x] 8.2 Build milestone progress: Leg Press 2x-start from logs plus self-assessed checkboxes

## 9. Verification

- [x] 9.1 Add unit tests for program-week/skip logic, phase/schedule lookups, and progression suggestions against the spec scenarios
- [x] 9.2 Manually verify full daily flow, export/import round-trip, and persistence across reload
- [x] 9.3 Run openspec validate and confirm the build is clean
