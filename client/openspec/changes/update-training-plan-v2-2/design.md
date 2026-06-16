## Context

The catalog and progression model live in `src/catalog/exercises.ts` and `src/engine/progression.ts`. Today each `ExerciseDef` carries a single static `sets`/`reps`/`seconds` value, and `progression.ts` only suggests next weight. The v2-2 plan changes three Workout B exercises and, more significantly, introduces rep periodization where the set/rep target is a function of program phase.

Program week/phase is already computed in `src/engine/schedule.ts` (`computeProgramWeek`, `phaseFor`). Note the rep-progression boundaries (weeks 1-8 / 9-16 / 17-26) differ from the schedule's `phaseFor` boundaries (1-4 / 5-16 / 17-26), so rep progression needs its own week→band mapping and must not reuse `phaseFor`.

Sessions are keyed by exercise id in persisted state (`AppState.sessions[date].entries[exerciseId]`). Removing the three old exercises means their ids (`back-extension`, `tricep-pushdown`, `bird-dog`) disappear from the catalog while old data may still reference them.

## Goals / Non-Goals

**Goals:**
- Update Workout B to the v2-2 exercise list, alternatives, and notes.
- Make displayed set/rep targets phase-aware per the rep-progression tables.
- Keep weight-increment logic unchanged.
- Render historical sessions for retired exercises without crashing.

**Non-Goals:**
- No change to scheduling, phases-as-weeks, body metrics, milestones, or data schema version.
- No automatic weight adjustment on rep-range drop (the ~10% bump stays user-driven guidance).
- No data migration/rewrite of old logged entries.

## Decisions

- **Rep target as data, not logic.** Add a per-exercise `repProgression` field to `ExerciseDef`: an object keyed by rep-band (`band1`/`band2`/`band3`) giving `{ sets, reps?|seconds?, addLoad? }`. A pure helper `repTargetFor(exercise, programWeek)` maps week→band and returns the active target. Chosen over hardcoding a lookup table in the view so the catalog stays the single source of truth.
  - Alternative considered: compute targets in the view from week thresholds. Rejected — scatters plan data across UI and engine.
- **Separate band mapping from `phaseFor`.** Add `repBandFor(week): 1|2|3` in the progression engine using 8/16 cutoffs. Reusing `phaseFor` would mislabel weeks 5-8.
- **Keep `sets`/`reps` as the Phase-1 starting value.** Existing fields remain and equal the band-1 target, so any code not yet phase-aware still shows a valid starting value; `repProgression` is additive.
- **Replacement, not soft-deprecation, of the three exercises.** Remove their defs from the catalog. `getExercise(id)` already returns `undefined` for unknown ids, so the render path for history must tolerate `undefined` (show stored name/id rather than dereferencing a def).

## Risks / Trade-offs

- [History view dereferences a missing `ExerciseDef`] → audit views that look up exercise defs from stored entries; fall back to the stored id/label when `getExercise` returns undefined.
- [Boundary off-by-one between rep bands and schedule phases] → unit-test `repBandFor` at weeks 8, 9, 16, 17.
- [Tests asserting old Workout B contents] → update `progression.test.ts` / any catalog assertions.

## Migration Plan

- Pure code/data update; no schema bump (`SCHEMA_VERSION` stays 1).
- Old logged entries for retired ids are left in place and read-only.
- Rollback: revert the change; old entries for new ids (single-arm-row etc.) would then be the orphaned ones, equally tolerated by the same undefined-safe render path.

## Open Questions

- Does any current view render set/rep from `getExercise` for historical sessions, or only for the active workout? Confirm during implementation to size the undefined-safe handling.
