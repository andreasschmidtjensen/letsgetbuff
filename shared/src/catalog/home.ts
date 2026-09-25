import type { StretchLevelId } from '../types.js'

// ─────────────────────────────────────────────────────────────────────────────
// Home workout catalog (issue #1, leveled in v52) — plan-as-data, mirroring
// catalog/stretches.ts.
//
// A bodyweight-only circuit for days you can't get to the gym: no equipment,
// 10–15 minutes door to door. Timed intervals (not reps) so the whole thing
// runs off the shared countdown engine. Logged as a `home` ActivityEntry from
// the Home view — the Tue/Sat gym calendar is untouched.
//
// Progression swaps in HARDER VARIANTS, not more time: each exercise has three
// levels (same model as the stretch catalog). The suggestion engine lives in
// engine/homeProgression.ts: two consecutive felt-easy circuits at a level
// suggest the next one; a 28+ day break drops one level with a fast return.
// ─────────────────────────────────────────────────────────────────────────────

export interface HomeExerciseLevel {
  level: StretchLevelId
  name: string
  cues: string[]
  videoId: string // 11-char YouTube id — form demo shown on the Home training tab
  vertical?: boolean // true = YouTube Short (9:16); embed renders portrait
  progressNote: string
}

export interface HomeExercise {
  id: string
  /** Family name (the slot in the circuit); each level names its variant. */
  name: string
  /** Why this slot is in the circuit — mirrors ExerciseDef.rationale.purpose. */
  purpose: string
  levels: [HomeExerciseLevel, HomeExerciseLevel, HomeExerciseLevel]
}

export interface HomeWorkoutPlan {
  name: string
  rounds: number
  workSeconds: number
  restSeconds: number
  warmupSeconds: number
  exercises: HomeExercise[]
}

interface LevelText { name: string; cues: string[]; videoId: string; vertical?: boolean; progressNote: string }

function levels(texts: [LevelText, LevelText, LevelText]): [HomeExerciseLevel, HomeExerciseLevel, HomeExerciseLevel] {
  return texts.map((t, i) => ({ level: (i + 1) as StretchLevelId, ...t })) as
    [HomeExerciseLevel, HomeExerciseLevel, HomeExerciseLevel]
}

export const HOME_WORKOUT: HomeWorkoutPlan = {
  name: 'Home circuit',
  rounds: 2,
  workSeconds: 40,
  restSeconds: 20,
  warmupSeconds: 60,
  exercises: [
    {
      id: 'bw-squat',
      name: 'Squats',
      purpose: 'The knee-dominant leg slot: quads and glutes, the pattern the gym trains with lunge and leg press.',
      levels: levels([
        {
          name: 'Bodyweight squats',
          cues: ['Feet shoulder-width, toes slightly out', 'Sit back and down, chest up', 'Drive through the whole foot'],
          videoId: 'ZLJBfYF_oO0',
          progressNote: 'Ready when 40s of clean squats leaves plenty in the tank.',
        },
        {
          name: 'Pause squats',
          cues: ['Same squat, 2-3s dead stop at the bottom', 'Stay tight in the pause — no relaxing', 'Drive up without bouncing'],
          videoId: 'S-X3CFoK0t8', vertical: true,
          progressNote: 'Ready when the pauses stay tight for the whole interval.',
        },
        {
          name: 'Jump squats',
          cues: ['Squat down, explode up', 'Land soft — toes then heels, knees tracking', 'Reset briefly between jumps'],
          videoId: 'h5TmdMMtIT4', vertical: true,
          progressNote: 'Top level — power work; land quietly or drop back a level.',
        },
      ]),
    },
    {
      id: 'push-up',
      name: 'Push-ups',
      purpose: 'The horizontal push slot: chest, front delts and triceps — the bench press with no bench.',
      levels: levels([
        {
          name: 'Push-ups',
          cues: ['Hands under shoulders, body in one line', 'Lower with control, elbows ~45°', 'On knees or against a table to scale down'],
          videoId: 'WDIpL0pjun0',
          progressNote: 'Ready when full push-ups last the whole 40s with a straight body.',
        },
        {
          name: 'Feet-elevated push-ups',
          cues: ['Feet on a step or couch', 'Body stays one line — no sagging hips', 'More weight on the shoulders: control the descent'],
          videoId: 'MjnJWRwbSYE', vertical: true,
          progressNote: 'Ready when the elevated angle feels as smooth as the floor did.',
        },
        {
          name: 'Archer push-ups',
          cues: ['Hands wide; lower toward one hand', 'The other arm stays long — it helps a little', 'Alternate sides each rep'],
          videoId: 'Q9pMuxbfWUU', vertical: true,
          progressNote: 'Top level — most of your weight on one arm.',
        },
      ]),
    },
    {
      id: 'reverse-lunge',
      name: 'Lunges',
      purpose: 'The single-leg slot: balance and per-leg strength, mirroring the gym’s dumbbell lunge.',
      levels: levels([
        {
          name: 'Reverse lunges',
          cues: ['Step back, drop the back knee toward the floor', 'Front shin vertical, torso tall', 'Alternate legs each rep'],
          videoId: 'u_zSfK5ZFU4',
          progressNote: 'Ready when 40s of alternating lunges is steady, no wobbles.',
        },
        {
          name: 'Bulgarian split squats',
          cues: ['Rear foot on the couch or a chair', 'Front shin vertical, hips square', 'Switch legs halfway through the interval'],
          videoId: 'or1frhkjBDc', vertical: true,
          progressNote: 'Ready when both legs handle their half-interval with control.',
        },
        {
          name: 'Jumping lunges',
          cues: ['Lunge, jump, switch legs mid-air', 'Land soft with the front shin vertical', 'Slow down rather than lose the landing'],
          videoId: 'acLvV5Gwi7o', vertical: true,
          progressNote: 'Top level — explosive; quiet landings are the standard.',
        },
      ]),
    },
    {
      id: 'plank',
      name: 'Plank',
      purpose: 'The anti-extension core slot: the same trunk brace the gym plank builds, kept in the circuit for frequency.',
      levels: levels([
        {
          name: 'Plank',
          cues: ['Forearms down, body in one straight line', 'Squeeze glutes, brace the belly', 'Breathe — don\'t hold your breath'],
          videoId: 'mwlp75MS6Rg',
          progressNote: 'Ready when 40s is solid with no hip sag.',
        },
        {
          name: 'Shoulder-tap planks',
          cues: ['High plank, tap the opposite shoulder', 'Hips stay level — no rocking', 'Slow, deliberate taps'],
          videoId: 'eyeuugrpLYA', vertical: true,
          progressNote: 'Ready when the hips stay dead level through every tap.',
        },
        {
          name: 'Body-saw planks',
          cues: ['Forearm plank, rock forward and back', 'Small range, long body', 'The further you saw, the harder it gets'],
          videoId: 'dddE4abamB0', vertical: true,
          progressNote: 'Top level — a moving lever, keep the brace the whole time.',
        },
      ]),
    },
    {
      id: 'glute-bridge',
      name: 'Glute bridges',
      purpose: 'The hinge slot: glutes and hamstrings from the floor — the RDL’s pattern with zero spinal load.',
      levels: levels([
        {
          name: 'Glute bridges',
          cues: ['On your back, heels close to hips', 'Drive hips up, squeeze at the top', 'Ribs down — don\'t arch the lower back'],
          videoId: '8bbE64NuDTU',
          progressNote: 'Ready when a full interval of bridges barely burns.',
        },
        {
          name: 'Marching bridges',
          cues: ['Hold the bridge, lift one knee at a time', 'Hips stay level — no dipping', 'Slow march, full control'],
          videoId: 'ORO64L7Iz4w', vertical: true,
          progressNote: 'Ready when the hips stay level through every march.',
        },
        {
          name: 'Single-leg glute bridges',
          cues: ['One foot down, the other leg long', 'Drive through the heel, hips square', 'Switch legs halfway through'],
          videoId: 'V1NKta2znwU', vertical: true,
          progressNote: 'Top level — one leg does all the work.',
        },
      ]),
    },
    {
      id: 'mountain-climber',
      name: 'Conditioning',
      purpose: 'The heart-rate slot: full-body conditioning to finish each round — the cardio the gym days don’t cover.',
      levels: levels([
        {
          name: 'Mountain climbers',
          cues: ['Push-up position, drive knees to chest', 'Keep hips level, steady rhythm', 'Slow down rather than lose form'],
          videoId: 'cnyTQDSE884',
          progressNote: 'Ready when the pace stays steady for the whole interval.',
        },
        {
          name: 'Cross-body mountain climbers',
          cues: ['Knee drives to the OPPOSITE elbow', 'Adds rotation for the obliques', 'Hips stay low and level'],
          videoId: 'mMQVgu3dX1c', vertical: true,
          progressNote: 'Ready when the twist doesn’t break your rhythm.',
        },
        {
          name: 'Burpees',
          cues: ['Squat, kick back, push-up, jump up', 'Move smoothly — no flopping down', 'Skip the jump to scale down'],
          videoId: 'zlYA1SENYG4', vertical: true,
          progressNote: 'Top level — the classic finisher.',
        },
      ]),
    },
  ],
}

export function getHomeExercise(id: string): HomeExercise | undefined {
  return HOME_WORKOUT.exercises.find(e => e.id === id)
}

export function getHomeLevel(ex: HomeExercise, lvl: StretchLevelId): HomeExerciseLevel {
  return ex.levels.find(l => l.level === lvl) ?? ex.levels[0]
}

// One flat, playable step list: warm-up, then rounds of work/rest. No rest
// after the final exercise of the final round. `levelFor` picks each
// exercise's variant (default: level 1).
export interface HomeStep {
  kind: 'warmup' | 'work' | 'rest'
  name: string
  seconds: number
  cues: string[]
  round: number // 0 for warm-up
  exerciseIndex: number // -1 for warm-up/rest
}

export function homeWorkoutSteps(
  plan: HomeWorkoutPlan = HOME_WORKOUT,
  levelFor: (ex: HomeExercise) => StretchLevelId = () => 1,
): HomeStep[] {
  const steps: HomeStep[] = [{
    kind: 'warmup',
    name: 'Warm-up',
    seconds: plan.warmupSeconds,
    cues: ['March or jog in place', 'Arm circles and shoulder rolls', 'Loosen up hips and knees'],
    round: 0,
    exerciseIndex: -1,
  }]
  for (let r = 1; r <= plan.rounds; r++) {
    plan.exercises.forEach((ex, i) => {
      const lvl = getHomeLevel(ex, levelFor(ex))
      steps.push({ kind: 'work', name: lvl.name, seconds: plan.workSeconds, cues: lvl.cues, round: r, exerciseIndex: i })
      const isLast = r === plan.rounds && i === plan.exercises.length - 1
      if (!isLast) {
        steps.push({ kind: 'rest', name: 'Rest', seconds: plan.restSeconds, cues: [], round: r, exerciseIndex: -1 })
      }
    })
  }
  return steps
}

export function homeWorkoutMinutes(plan: HomeWorkoutPlan = HOME_WORKOUT): number {
  const total = homeWorkoutSteps(plan).reduce((sum, s) => sum + s.seconds, 0)
  return Math.round(total / 60)
}
