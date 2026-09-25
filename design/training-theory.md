# Training theory — why the plan looks the way it does

This document reconstructs the reasoning behind every exercise, rep number, load
convention and progression rule in the app. The original source was a training
plan PDF (v2, revised v2-2) that is **not** in the repo and gave numbers without
rationale; where the PDF was silent, the reasoning below is reconstructed from
standard strength-training practice and marked as such. It is the source of
truth for the in-app "Explain why" rationale strings and the Program Guide view.

The last section lists **recommendations** — possible changes to the progression
mechanics. None of them are implemented; they are here to be discussed and
decided on first.

---

## 1. The shape of the program

Two full-body-ish days, split by movement pattern rather than body part:

- **Workout A — Push & Hinge**: lunge, bench press, Romanian deadlift, shoulder
  press, plank, side plank, calf raise.
- **Workout B — Pull & Quad**: leg press, single-arm row, lat pulldown, back
  extension (plan v6), curl, overhead tricep extension, Pallof press, face pull.

Why this split: with only ~2 sessions a week, each day needs to hit most of the
body. Splitting by *pattern* (push/hinge vs pull/quad-dominant) means every
muscle gets trained at least once per week even when only one of the two days
happens, and no single day is all-legs or all-arms. Core work (plank family,
Pallof) appears on both days because core responds well to frequency and
recovers fast.

Each day: **one heavy lower-body lead** (lunge / leg press), **one or two
compound upper-body lifts** (bench + shoulder press / row + pulldown), **a hinge
or arm accessory block**, and **core**. Compounds come first while fresh;
isolation and core come last because fatigue there doesn't compromise safety on
the big lifts.

## 2. Rep bands: why 3×10 → 3×8 → 4×6

Most compound lifts follow the band scheme. **Since v51 a band is earned per
exercise by how many times you have actually logged it** — not by weeks:

| Band | Your sessions of that exercise | Target | Intent |
|------|-------------------------------|--------|--------|
| 1 | 1–8 | 3×10 | **Technique + work capacity.** Ten reps is light enough to groove form, heavy enough to build muscle. Most of the early "progress" is neural — learning the lift. |
| 2 | 9–16 | 3×8 | **Hypertrophy with more load.** Fewer reps per set lets the weight climb while total volume stays similar. Form is assumed stable by now. |
| 3 | 17+ | 4×6 | **Strength emphasis.** Heavier, lower-rep sets; the fourth set keeps total volume from collapsing (24 reps vs band 2's 24). |

This is a classic *linear periodization* taper: volume trades for intensity as
the lifter becomes more trained. The boundaries (8/16 sessions) equal the old
week-8/week-16 ones on the nominal once-a-week-per-workout schedule — but time
that passes without training no longer advances anything, an exercise added
late ramps on its own clock, and training more often advances faster.

Two guard rails:

- **Layoff regression:** 28+ days without an exercise drops it one band —
  heavy low-rep sets are the wrong way back in. The earned band returns after
  **3 sessions**, not the eight it took originally. (Weight has its own,
  shorter comeback rule: the 14-day ~90% deload, §5.)
- **The ~10% jump:** when a band drops the reps, the weight should go up ~10%
  (v2-2 design note). The app now says so in the explain-why panel on the
  first session of a new band; the suggestion itself still comes from your own
  last session.

## 3. Per-exercise review

Conventions used below: *load mode* is what the kg number you type means —
`per hand` (one dumbbell in each hand), `single` (one implement total), or
`total` (machine stack / barbell). See §4.

### Workout A — Push & Hinge

**Dumbbell Lunge — 3×10 → 3×8 → 4×6, +1 kg, per hand, per side**
Unilateral knee-dominant lead. Trains quads and glutes plus the balance and hip
stability a bilateral squat hides. Follows the full compound taper because it is
a loadable strength movement. Per-side logging because left and right can
differ. The +1 kg dumbbell step is the smallest jump most gyms' dumbbell racks
allow; small steps matter because a lunge is balance-limited before it is
strength-limited.

**Dumbbell Bench Press — 3×10 → 3×8 → 4×6, +1 kg, per hand**
The horizontal push: chest, front delts, triceps. Dumbbells over barbell for
two-person home/gym flexibility and even left–right development. Full compound
taper — pressing strength responds well to the 10→8→6 progression.

**Romanian Deadlift — 3×10 → 3×10 → 3×8, +2.5 kg, barbell (total)**
The hinge: hamstrings, glutes, spinal erectors. The *only* compound whose rep
scheme deliberately lags (10/10/8 instead of 10/8/6): hinge technique degrades
first when reps get low and loads get high, and a rounded-back heavy RDL is the
riskiest thing in the plan. Hence also the standing rule in its notes: **reduce
weight, not reps, if it twinges** — keeping reps at 8+ keeps every rep
submaximal. +2.5 kg is one small plate per side of the bar.

**Seated Shoulder Press — 3×10 → 3×8 → 4×6, +1 kg, per hand**
The vertical push: delts and triceps. Seated to take the lower back out of it
(see its note about not arching). Full compound taper.

**Plank — 3×30s → 3×45s → 3×60s, unweighted**
Anti-extension core. Progresses in *time*, not load, because the goal is
endurance of the trunk brace that protects the RDL and presses — not maximal
core strength. 60s holds are the practical ceiling; beyond that the exercise
would change (weighted plank, harder variation) rather than get longer.

**Side Plank — 2×20s → 2×30s → 2×40s, unweighted, per side**
Anti-lateral-flexion core (obliques, QL). Shorter holds than the front plank
because the side position is harder and done once per side. Two sets per side
keeps the total core time budget reasonable.

**Standing Calf Raise — 3×12 all bands, band 3 adds load, +1 kg (single dumbbell)**
Calves respond to reps and *range* (deep stretch, full pause at the top — see
its notes) more than to load, so the reps never taper. Bodyweight until band 3,
then hold one dumbbell. `single` load mode: the number is that one dumbbell.

### Workout B — Pull & Quad

**Leg Press — 3×10 → 3×8 → 4×6, +5 kg, machine (total)**
Bilateral quad-dominant lead. Machine-guided so it can be loaded heavier and
progressed faster than the lunge without a balance ceiling — hence the bigger
+5 kg step (machine stacks/plates move in bigger jumps, and leg strength grows
fastest). Full compound taper.

**Single-Arm Dumbbell Row — 3×10 → 3×8 → 4×6, +1 kg, single dumbbell, per side**
The horizontal pull: lats, rhomboids, rear delts, biceps. One arm at a time
with a hand on the bench takes the lower back out of it (it replaced the back
extension in v2-2 for exactly that reason). Full compound taper. Load mode
`single`: the number is the one dumbbell you row with.

**Lat Pulldown — 3×10 → 3×8 → 4×6, +2.5 kg, stack (total)**
The vertical pull: lats and biceps, the pull-up you can actually progress from
day one. Full compound taper; +2.5 kg is the typical smallest stack pin jump.

**Back Extension — 3×12 all bands, +1 kg, single dumbbell/plate — added in plan v6**
Direct lower-back and glute work on the 45° bench: the hinge pattern B was
missing (v2-2 removed the old machine back extension when the single-arm row
came in), balancing A's RDL so each gym day carries one hinge and the two
spinal-erector loads land on different days. Like the RDL, its reps never go
low: hinge quality is the first casualty of heavy low-rep sets, so it stays at
3×12 and progresses by holding a little more weight — never by grinding reps.
Cue: squeeze the glutes up, stop in line with the body, no overextension.

**Dumbbell Curl — 2×12 fixed, +1 kg, per hand**
Direct biceps work. Fixed at 2×12 in every band: isolation lifts don't belong in
low-rep ranges (elbow stress, no technique payoff), and two sets is enough
because biceps already work in every row and pulldown. Progress here is weight
only, and slowly.

**Overhead Tricep Extension — 2×12 fixed, +1 kg, single dumbbell**
Direct triceps work, overhead to hit the long head that pressing misses.
Fixed 2×12 for the same isolation logic as the curl. One dumbbell held in both
hands (`single`): the number is that dumbbell. It replaced the cable pushdown in
v2-2 so both arm lifts need only dumbbells.

**Pallof Press — 3×10 all bands, band 3 adds load, +2.5 kg, stack (total), per side**
Anti-rotation core. Reps stay at 10 because the point is a controlled press and
brief hold, not grinding reps; band 3 adds stack weight instead. It replaced the
bird dog in v2-2 as the loadable anti-rotation progression.

**Face Pull — 3×15 → 3×15 → 3×12, +2.5 kg, stack (total), joins at week 9**
*The one everyone asks about.* Face pulls are not a strength lift — they are
**shoulder-health work**: rear delts, mid/lower traps, and the external rotators
of the rotator cuff. These are small muscles pulled through a long arc; the
appropriate load is light, and light loads need high reps (15) to be a stimulus
at all. Loading a face pull heavy at low reps ruins the movement — momentum
takes over, the external-rotation finish disappears, and the shoulder-health
purpose is lost. Band 3 drops to 12 only because by then the stack weight has
crept up enough that 12 strict reps is the same total work. It joins at week 9
(`minWeek`) because it exists to *balance* accumulated pressing volume — in the
first 8 weeks there isn't much to balance yet, and the plan starts smaller on
purpose. (The source PDF gave no rationale for the 15; this is the
reconstruction, and it is the standard one.)

## 4. Load conventions — what the kg you type means

The logs store a bare number; until now nothing said whether it meant one
dumbbell or two. The convention, now labeled in the app per exercise:

| Mode | Meaning | Exercises |
|------|---------|-----------|
| **per hand** | one dumbbell in *each* hand; "12 kg" = 2×12 kg carried | dumbbell lunge, bench press, shoulder press, curl |
| **single** | one implement total (one dumbbell/plate, possibly both hands or one side at a time) | calf raise, single-arm row, overhead tricep extension, back extension |
| **total** | the whole machine stack or barbell | RDL (barbell), leg press, lat pulldown, Pallof press, face pull |
| — | unweighted | plank, side plank |

Why not normalize everything to total kg? Because the increments would stop
matching reality: "+1 kg" on a per-hand dumbbell lift is a real rack jump,
"+2 kg total" is the same jump written confusingly, and history charts would
need every old entry reinterpreted — but the old entries never recorded which
meaning the person typing them intended. So: **the numbers stay as logged, and
the label now says what they mean.** Consequence to be aware of: History's
volume number (kg × reps) counts a per-hand lift's number once, not doubled.
That is a labeled convention, not a bug — volume is only ever compared against
itself per exercise.

The per-type increments are the lower bounds of the plan's suggested ranges
(dumbbell +1–2, leg press +5–10, cable +2.5–5, RDL +2.5 fixed): with ~2 sessions
a week, the smallest possible step is the one you can actually make every time.

## 5. The progression system as implemented

Two independent mechanisms, and it is worth being clear about which is which:

### Weight — fully "follows how much we train"

Per exercise, computed fresh from *your* history every time
(`shared/src/engine/progression.ts`):

1. **Never logged with a weight** → no suggestion; pick something you can
   control for every rep. The next session builds on it.
2. **Last session ≥14 days ago** → *deload*: ~90% of your last weight, rounded
   to the increment. Never above the old weight, never below one increment.
3. **Last session, "felt easy" not ticked** → *hold* the same weight. Weight
   never drops on its own.
4. **"Felt easy" ticked** → add the increment (+1 / +2.5 / +5 by equipment).

The only progression signal is the felt-easy checkbox (≈ two-plus reps left in
the tank). Logged reps and RIR are recorded but not used by the suggestion.

### Sets/reps — follows *your sessions of each exercise* (since v51)

The rep band comes from `exerciseRepBand` in
`shared/src/engine/progression.ts`: it counts the sessions in which **that
exercise** was really logged (a set with reps or seconds — a prefiled weight
alone is not training), strictly before the day being viewed. Sessions 1–8 are
band 1, 9–16 band 2, 17+ band 3.

- Training twice in a week advances that exercise twice. A month off advances
  nothing.
- Each exercise rides its own clock: the face pull you started in month three
  is in band 1 while the bench is in band 2.
- **Layoff regression:** a 28+ day gap on an exercise drops it one band; three
  logged sessions restore the earned band (fast return, unlike the original
  eight-session climb).
- The first session of a newly earned band carries the "~10% more weight"
  nudge in the explain-why panel.

The **program week** (`shared/src/engine/schedule.ts` — trained ISO weeks minus
skipped, clamped 1–26) still exists, but now only drives the schedule display,
the phase label, and `minWeek` onboarding (face pull at week 9, with the "once
trained, always yours" guard).

## 6. The home circuit (v52: leveled variants)

Six timed slots (40s work / 20s rest × 2 rounds, ~13 min) covering the gym's
movement patterns on days the gym doesn't happen: **squat** (knee-dominant),
**push-up** (horizontal push), **lunge** (single-leg), **plank** (anti-extension
core), **glute bridge** (hinge with zero spinal load) and a **conditioning
finisher** — the heart-rate work the gym days don't cover. Timed intervals
rather than reps so the whole circuit runs off one countdown and nobody counts.

**Progression swaps in harder variants, not longer intervals** — the session
should stay a ~13-minute "movement snack". Each slot has three levels
(e.g. squats → pause squats → jump squats; push-ups → feet-elevated → archer;
mountain climbers → cross-body → burpees). The engine
(`shared/src/engine/homeProgression.ts`) mirrors the stretch rule exactly: the
finish screen asks one question ("felt easy?"), two easy circuits in a row
suggest the next variant, a 28+ day break drops one level with a two-circuit
return, and the ↓/↑ override on the Home training tab always wins. The levels
actually performed are recorded on the day's activity entry, so the suggestion
is reproducible from the log alone.

## 7. The stretch program

Two routines, always in this order: the **movement flow** first (CARs, world's
greatest stretch, deep-squat sits, 90/90s, Cossacks, cat-cow — active
full-range work that doubles as the gym-day warm-up), then the **static holds**
(hip front, hamstrings, glutes, calves, chest, t-spine, lats, shoulders, neck)
on warm tissue, where longer holds are productive and safe.

Each stretch has three levels with its own curated video. Progression
(`shared/src/engine/stretchProgression.ts`): two felt-easy sessions in a row at
a level suggest the next; since v52 a 28+ day break on a stretch drops it one
level — flexibility genuinely regresses with disuse — with two sessions to
restore it; the manual ↓/↑ always wins. Hold doses run 20–45s: long enough for
tissue to let go, short enough to stay honest.

## 8. Recommendations

Status after v51: items 1, 2 and 5 of the original list are **implemented** —
rep bands now count each exercise's own logged sessions (with the 28-day
regression / 3-session fast return), and the ~10% bump is surfaced on band
entry. Still open, in order of value-for-effort:

1. **Double progression instead of fixed bands.** Give each exercise a rep
   *range* (e.g. 8–12): felt-easy first adds reps up to the top of the range,
   then adds weight and resets to the bottom. The classic self-regulating
   scheme; it would fold the rep and weight mechanisms into one. Larger
   change: rep targets become history-dependent, bands/`repProgression` are
   replaced, and the explain-why text is rewritten.
2. **Use logged reps as a progression signal.** Today only the felt-easy tick
   matters; hitting all target reps could count as (or gate) "easy". Small
   engine change, but changes the meaning of a habit you already have — decide
   consciously.
3. **Plateau nudges.** After N consecutive holds at the same weight, suggest a
   small deload or a rep-range change instead of holding forever. Low priority:
   with felt-easy gating, "stuck" already just means "keep working".

---

*Sources: `shared/src/catalog/exercises.ts` (catalog),
`shared/src/engine/progression.ts` + `schedule.ts` (mechanics),
`client/openspec/specs/progression-guidance/spec.md` and
`client/openspec/changes/update-training-plan-v2-2/` (the surviving fragments of
the plan PDF's intent). Where those were silent, the rationale above is
reconstructed and says so.*
