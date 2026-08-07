import type { ProgressionType } from '../types.js'

export type SafetyCue = 'knee' | 'back'

export interface RepTarget {
  sets: number
  reps?: number
  seconds?: number
  addLoad?: boolean
}

export interface ExerciseDef {
  id: string
  name: string
  sets: number
  reps: number | null // null = timed
  seconds?: number
  perSide?: boolean
  progressionType: ProgressionType
  requiresKg: boolean
  // Ordered list of tutorial videos (YouTube Shorts preferred). The UI shows
  // them as a numbered, swipeable carousel (1, 2, 3...) so there are backups if
  // the first one isn't great. Always at least one entry.
  videoUrls: string[]
  alternatives: string[]
  notes: string
  safetyCues: SafetyCue[]
  // Onboarding ramp: hidden until this program week. Face Pull (9) is the only
  // one in the seeded catalog, but AI-discovered exercises can carry it too.
  // `getWorkoutExercises` overrides it for exercises the user has already logged.
  minWeek?: number
  repProgression?: {
    band1: RepTarget
    band2: RepTarget
    band3: RepTarget
  }
}

export interface WorkoutDef {
  id: 'A' | 'B'
  name: string
  warmup: string
  exercises: ExerciseDef[]
}

export const WORKOUTS: WorkoutDef[] = [
  {
    id: 'A',
    name: 'Push & Hinge',
    warmup: '10-minute elliptical, then 2x 30-second reverse plank',
    exercises: [
      {
        id: 'dumbbell-lunge',
        name: 'Dumbbell Lunge',
        sets: 3,
        reps: 10,
        perSide: true,
        progressionType: 'dumbbell',
        requiresKg: true,
        videoUrls: ['https://www.youtube.com/shorts/Rkkc-FnURyc'],
        alternatives: ['Goblet squat', 'Split squat'],
        notes: 'Step forward with control. Keep torso upright.',
        safetyCues: ['knee'],
        repProgression: {
          band1: { sets: 3, reps: 10 },
          band2: { sets: 3, reps: 8 },
          band3: { sets: 4, reps: 6 },
        },
      },
      {
        id: 'dumbbell-bench-press',
        name: 'Dumbbell Bench Press',
        sets: 3,
        reps: 10,
        progressionType: 'dumbbell',
        requiresKg: true,
        videoUrls: ['https://www.youtube.com/shorts/1V3vpcaxRYQ'],
        alternatives: ['Push-up', 'Machine chest press'],
        notes: 'Control the descent. Feet flat on floor.',
        safetyCues: [],
        repProgression: {
          band1: { sets: 3, reps: 10 },
          band2: { sets: 3, reps: 8 },
          band3: { sets: 4, reps: 6 },
        },
      },
      {
        id: 'rdl',
        name: 'Romanian Deadlift',
        sets: 3,
        reps: 10,
        progressionType: 'rdl',
        requiresKg: true,
        videoUrls: ['https://www.youtube.com/watch?v=amLSSb8cXok'],
        alternatives: ['Dumbbell deadlift', 'Good morning'],
        notes: 'Hinge at hips, back stays flat. Reduce weight not reps if it twinges.',
        safetyCues: ['back'],
        repProgression: {
          band1: { sets: 3, reps: 10 },
          band2: { sets: 3, reps: 10 },
          band3: { sets: 3, reps: 8 },
        },
      },
      {
        id: 'seated-shoulder-press',
        name: 'Seated Shoulder Press',
        sets: 3,
        reps: 10,
        progressionType: 'dumbbell',
        requiresKg: true,
        videoUrls: ['https://www.youtube.com/shorts/2D0TyoHv_EY'],
        alternatives: ['Standing shoulder press', 'Arnold press'],
        notes: 'Press straight up, avoid arching the lower back.',
        safetyCues: [],
        repProgression: {
          band1: { sets: 3, reps: 10 },
          band2: { sets: 3, reps: 8 },
          band3: { sets: 4, reps: 6 },
        },
      },
      {
        id: 'plank',
        name: 'Plank',
        sets: 3,
        reps: null,
        seconds: 30,
        progressionType: 'timed',
        requiresKg: false,
        videoUrls: ['https://www.youtube.com/shorts/hoeNgjheDHk'],
        alternatives: ['Dead bug', 'Hollow hold'],
        notes: 'Squeeze glutes, brace core. No hips sagging.',
        safetyCues: ['back'],
        repProgression: {
          band1: { sets: 3, seconds: 30 },
          band2: { sets: 3, seconds: 45 },
          band3: { sets: 3, seconds: 60 },
        },
      },
      {
        id: 'side-plank',
        name: 'Side Plank',
        sets: 2,
        reps: null,
        seconds: 20,
        perSide: true,
        progressionType: 'timed',
        requiresKg: false,
        videoUrls: ['https://www.youtube.com/shorts/cSIWldRoKTo'],
        alternatives: ['Suitcase carry', 'Side plank on knees'],
        notes: 'Elbow under shoulder, body in one line. Hips high — no sagging.',
        safetyCues: ['back'],
        repProgression: {
          band1: { sets: 2, seconds: 20 },
          band2: { sets: 2, seconds: 30 },
          band3: { sets: 2, seconds: 40 },
        },
      },
    ],
  },
  {
    id: 'B',
    name: 'Pull & Quad',
    // Rower and floor are side by side, so the two plank sets interleave with
    // the row blocks; on A the elliptical is elsewhere, so both sets come after.
    warmup: '5-minute rowing, then 30-second reverse plank, then 5-minute rowing, then 30-second reverse plank',
    exercises: [
      {
        id: 'leg-press',
        name: 'Leg Press',
        sets: 3,
        reps: 10,
        progressionType: 'legPress',
        requiresKg: true,
        videoUrls: ['https://www.youtube.com/shorts/nDh_BlnLCGc'],
        alternatives: ['Step-up', 'Goblet Squat'],
        notes: 'Feet hip-width. Don\'t lock knees at top. Adjust foot height for comfort.',
        safetyCues: ['knee'],
        repProgression: {
          band1: { sets: 3, reps: 10 },
          band2: { sets: 3, reps: 8 },
          band3: { sets: 4, reps: 6 },
        },
      },
      {
        id: 'single-arm-row',
        name: 'Single-Arm Dumbbell Row',
        sets: 3,
        reps: 10,
        perSide: true,
        progressionType: 'dumbbell',
        requiresKg: true,
        videoUrls: [
          'https://www.youtube.com/shorts/aFtWSOruuhs', // Buff Dudes Workouts
          'https://www.youtube.com/shorts/H8jf3DwlIlo', // Charles Vantor
          'https://www.youtube.com/shorts/nveMA9ko3yk', // SWEAT - Form Check w/ Katie Martin
        ],
        alternatives: ['Cable Row', 'Resistance Band Row'],
        notes: 'Rest hand and knee on bench. Drive elbow back. Don\'t twist torso.',
        safetyCues: ['back'],
        repProgression: {
          band1: { sets: 3, reps: 10 },
          band2: { sets: 3, reps: 8 },
          band3: { sets: 4, reps: 6 },
        },
      },
      {
        id: 'lat-pulldown',
        name: 'Lat Pulldown',
        sets: 3,
        reps: 10,
        progressionType: 'cable',
        requiresKg: true,
        videoUrls: ['https://www.youtube.com/shorts/jULa7guhCdM'],
        alternatives: ['Assisted pull-up', 'Cable row'],
        notes: 'Pull to upper chest. Keep chest up, shoulders back.',
        safetyCues: [],
        repProgression: {
          band1: { sets: 3, reps: 10 },
          band2: { sets: 3, reps: 8 },
          band3: { sets: 4, reps: 6 },
        },
      },
      {
        id: 'dumbbell-curl',
        name: 'Dumbbell Curl',
        sets: 2,
        reps: 12,
        progressionType: 'dumbbell',
        requiresKg: true,
        videoUrls: ['https://www.youtube.com/shorts/PuaJzTatIJM'],
        alternatives: ['Cable curl', 'Hammer curl'],
        notes: 'No swinging. Squeeze at the top.',
        safetyCues: [],
        repProgression: {
          band1: { sets: 2, reps: 12 },
          band2: { sets: 2, reps: 12 },
          band3: { sets: 2, reps: 12 },
        },
      },
      {
        id: 'overhead-tricep-extension',
        name: 'Overhead Tricep Extension',
        sets: 2,
        reps: 12,
        progressionType: 'dumbbell',
        requiresKg: true,
        videoUrls: [
          'https://www.youtube.com/shorts/pI23VMlsJhs', // Kade Howell - seated single arm
          'https://www.youtube.com/shorts/b_r_LW4HEcM', // DeltaBolic
          'https://www.youtube.com/shorts/AYqg9S5FrUU', // SquatCouple
        ],
        alternatives: ['Tricep Pushdown', 'Close-grip Push-up'],
        notes: 'Hold one dumbbell with both hands overhead. Elbows close to head.',
        safetyCues: [],
        repProgression: {
          band1: { sets: 2, reps: 12 },
          band2: { sets: 2, reps: 12 },
          band3: { sets: 2, reps: 12 },
        },
      },
      {
        id: 'pallof-press',
        name: 'Pallof Press',
        sets: 3,
        reps: 10,
        perSide: true,
        progressionType: 'cable',
        requiresKg: true,
        videoUrls: [
          'https://www.youtube.com/shorts/JdhDqvrTE1s', // Girls Gone Strong - standing
          'https://www.youtube.com/shorts/qOnAC5hz0Vg', // Hart Athletics - standing
          'https://www.youtube.com/shorts/dlAPLZSiBTU', // Hart Athletics - seated
        ],
        alternatives: ['Band Pallof Press', 'Suitcase Carry'],
        notes: 'Stand sideways to cable. Press out and hold briefly. Anti-rotation core.',
        safetyCues: ['back'],
        repProgression: {
          band1: { sets: 3, reps: 10 },
          band2: { sets: 3, reps: 10 },
          band3: { sets: 3, reps: 10, addLoad: true },
        },
      },
      {
        id: 'face-pull',
        name: 'Face Pull',
        sets: 3,
        reps: 15,
        progressionType: 'cable',
        requiresKg: true,
        videoUrls: ['https://www.youtube.com/shorts/MChHOiaCR7s'],
        alternatives: ['Band face pull', 'Rear delt fly'],
        notes: 'Pull to face height. External rotation at end.',
        safetyCues: [],
        minWeek: 9,
        repProgression: {
          // Band 1 is reachable: once trained, Face Pull stays in the plan even
          // if the program week falls back below 9 (missed weeks, or the start
          // date moved forward), and the rep band follows the lower week.
          band1: { sets: 3, reps: 15 },
          band2: { sets: 3, reps: 15 },
          band3: { sets: 3, reps: 12 },
        },
      },
      {
        id: 'standing-calf-raise',
        name: 'Standing Calf Raise',
        sets: 3,
        reps: 12,
        progressionType: 'dumbbell',
        requiresKg: true,
        videoUrls: ['https://www.youtube.com/shorts/8sT7Ne3Kzwc'],
        alternatives: ['Seated calf raise', 'Single-leg calf raise'],
        notes: 'Full range: deep heel stretch at the bottom, pause tall on the toes. Hold a dumbbell for load.',
        safetyCues: [],
        repProgression: {
          band1: { sets: 3, reps: 12 },
          band2: { sets: 3, reps: 12 },
          band3: { sets: 3, reps: 12, addLoad: true },
        },
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Plan-as-data
//
// `WORKOUTS` above is the authored source. The rest of the app must NOT read it
// directly — it goes through `getPlan()`. The plan is modelled as data (a
// versioned object) so the client can inject the server-fetched plan at startup
// via `setLivePlan()` without touching any view code.
// ---------------------------------------------------------------------------

export interface Plan {
  version: number
  workouts: WorkoutDef[]
}

export const DEFAULT_PLAN: Plan = {
  version: 3, // v2: reverse plank in warmups (DB migration 6); v3: side plank + calf raise (migration 7)
  workouts: WORKOUTS,
}

// Module-level override — populated by the client store after fetching /api/plan.
// The server always uses DEFAULT_PLAN (getPlan() is called at seed time before
// any client can override it); only the browser client ever calls setLivePlan().
let _livePlan: Plan | null = null

// Shared empty default for getWorkoutExercises — avoids allocating a Set on
// every render for callers that have no logged history to pass.
const NO_LOGGED_IDS: ReadonlySet<string> = new Set()

/**
 * Override the active plan with the server-fetched version.
 * Call once at app startup after /api/plan resolves.
 */
export function setLivePlan(plan: Plan): void {
  _livePlan = plan
}

/**
 * The single accessor for the active plan.
 * Returns the server-fetched plan if available, otherwise the seeded default.
 */
export function getPlan(): Plan {
  return _livePlan ?? DEFAULT_PLAN
}

export function getWorkout(id: 'A' | 'B'): WorkoutDef | undefined {
  return getPlan().workouts.find(w => w.id === id)
}

/**
 * The exercises to show for a workout at a given program week.
 *
 * `minWeek` is an onboarding ramp: an exercise stays out of the plan until the
 * lifter has some weeks behind them. But the program week can move DOWN —
 * `computeProgramWeek` counts only weeks containing a real gym session, and
 * Settings lets the start date move forward — so a pure week test would delete
 * an exercise the user has already been training. Anything in `loggedIds` is
 * therefore kept regardless of week: once trained, always yours. The rep band
 * still follows the (lower) week, so the exercise comes back with its band-1
 * target rather than disappearing.
 *
 * `loggedIds` (build it with `loggedExerciseIds(state.sessions)`) is optional
 * and defaults to empty, so pure-catalog callers get the plain week-based ramp.
 */
export function getWorkoutExercises(
  workout: 'A' | 'B',
  programWeek: number,
  loggedIds: ReadonlySet<string> = NO_LOGGED_IDS,
): ExerciseDef[] {
  const w = getWorkout(workout)
  if (!w) return []
  return w.exercises.filter(e => !e.minWeek || programWeek >= e.minWeek || loggedIds.has(e.id))
}

export function getExercise(id: string): ExerciseDef | undefined {
  return getPlan().workouts.flatMap(w => w.exercises).find(e => e.id === id)
}

export const QUALITATIVE_MILESTONES = [
  { id: 'bike-commute-easy', label: 'Bike commute feels easy' },
  { id: 'posture-improved', label: 'Posture visibly improved' },
  { id: 'energy-up', label: 'Daily energy noticeably higher' },
  { id: 'sleep-quality', label: 'Sleep quality improved' },
  { id: 'shoulder-mobility', label: 'Shoulder mobility improved' },
]
