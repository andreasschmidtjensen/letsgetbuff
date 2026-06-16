## Why

The training plan PDF was revised (v2 → v2-2). The app's built-in catalog and progression model still reflect the old plan, so the workouts and rep targets shown to the user no longer match the program they are following.

## What Changes

- Replace three Workout B exercises:
  - Back Extension Machine → **Single-Arm Dumbbell Row** (3x10/side)
  - Tricep Pushdown → **Overhead Tricep Extension (DB)** (2x12)
  - Bird Dog → **Pallof Press (cable)** (3x10/side)
- Update Leg Press alternative (Box Squat → Goblet Squat) and coaching notes.
- **BREAKING (behavioral)**: Introduce phase-based rep periodization. Set/rep targets are no longer static; they shift with the program phase:
  - Main compounds: Wk 1-8 `3x10`, Wk 9-16 `3x8`, Wk 17-26 `4x6`
  - Romanian Deadlift lags for back safety: `3x10` / `3x10` / `3x8`
  - Accessories mostly hold (Curl, Overhead Tricep Extension stay `2x12`)
  - Plank: `3x30s` / `3x45s` / `3x60s`
  - Face Pull: `3x15` / `3x15` / `3x12`
  - Pallof Press: `3x10/side` throughout, add load from Wk 17
- Update the workout intro to reflect that displayed sets/reps are starting values that evolve per the rep progression.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `workout-catalog`: Workout B exercise list changes (three swaps + Leg Press alternative). Set/rep target becomes phase-dependent rather than a single fixed value per exercise.
- `progression-guidance`: Adds a phase-based rep-range progression alongside the existing weight-increment guidance, including the RDL lag and per-accessory rules.

## Impact

- `src/catalog/exercises.ts`: exercise definitions (Workout B swaps, alternatives, notes), and the rep-progression data per exercise/phase.
- `src/engine/progression.ts`: new rep-target lookup by exercise and program phase; existing weight-increment logic unchanged.
- `src/views/WorkoutView.tsx` (and any view rendering set/rep targets): display phase-correct reps.
- Existing logged sessions keyed by exercise id: `back-extension`, `tricep-pushdown`, `bird-dog` ids are removed; persistence/migration must not crash on old session data referencing them.
- Specs: `workout-catalog`, `progression-guidance`.
