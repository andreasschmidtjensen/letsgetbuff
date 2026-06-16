## 1. Catalog: Workout B exercise swaps

- [x] 1.1 Remove `back-extension`, `tricep-pushdown`, `bird-dog` from Workout B in `src/catalog/exercises.ts`
- [x] 1.2 Add `single-arm-row` (Single-Arm Dumbbell Row, 3x10/side, perSide, dumbbell, requiresKg, alternatives Cable Row / Resistance Band Row, back safety cue) in the Back Extension slot
- [x] 1.3 Add `overhead-tricep-extension` (2x12, dumbbell, requiresKg, alternatives Tricep Pushdown / Close-grip Push-up) in the Tricep Pushdown slot
- [x] 1.4 Add `pallof-press` (3x10/side, perSide, cable, requiresKg, alternatives Band Pallof Press / Suitcase Carry, anti-rotation notes) in the Bird Dog slot
- [x] 1.5 Update Leg Press alternatives (Step-up, Goblet Squat) and notes per v2-2
- [x] 1.6 Update the workout intro copy to "starting values that evolve per rep progression"
- [x] 1.7 Set/verify video tutorial URLs for the three new exercises (using YouTube search URLs - replace with specific video IDs when available)

## 2. Rep progression model

- [x] 2.1 Add a `repProgression` field to `ExerciseDef` (band1/band2/band3 → sets + reps|seconds + optional addLoad)
- [x] 2.2 Populate `repProgression` for all exercises per the v2-2 tables (compounds 3x10/3x8/4x6; RDL 3x10/3x10/3x8; accessories hold; Plank 30/45/60s; Face Pull 3x15/3x15/3x12; Pallof 3x10/side +load wk17)
- [x] 2.3 Add `repBandFor(week): 1|2|3` (cutoffs 8/16) in `src/engine/progression.ts`
- [x] 2.4 Add `repTargetFor(exercise, programWeek)` helper returning the active set/rep target
- [x] 2.5 Keep `suggestNextWeight` weight logic unchanged; confirm independence from rep band

## 3. UI wiring

- [x] 3.1 Update `src/views/WorkoutView.tsx` to display the phase-correct set/rep target via `repTargetFor`
- [x] 3.2 Surface rep-shift guidance (form + 4-6 weeks, ~10% weight bump) at a rep-range drop
- [x] 3.3 Audit history rendering for `getExercise(id) === undefined` and fall back to stored id/name for retired exercises

## 4. Tests

- [x] 4.1 Unit-test `repBandFor` at weeks 8, 9, 16, 17
- [x] 4.2 Unit-test `repTargetFor` for a compound, RDL, an accessory, Plank, Face Pull, Pallof across all three bands
- [x] 4.3 Update existing catalog/progression tests to the v2-2 Workout B contents
- [x] 4.4 Test that history with retired exercise ids renders without throwing

## 5. Verify

- [x] 5.1 `openspec validate update-training-plan-v2-2`
- [x] 5.2 Run the test suite and the app build; confirm Workout B and per-phase reps display correctly
