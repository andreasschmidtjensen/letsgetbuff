import type { ProgressionType } from '../types.js'

export type SafetyCue = 'knee' | 'back'

export interface RepTarget {
  sets: number
  reps?: number
  seconds?: number
  addLoad?: boolean
}

// What the kg number the user types means. Logged weights are bare numbers and
// are never rewritten — this only labels the convention per exercise.
//   perHand: one dumbbell in EACH hand ("12kg" = 2 x 12kg carried)
//   single:  one implement total (one dumbbell, both hands or one side at a time)
//   total:   the whole machine stack or barbell
export type LoadMode = 'perHand' | 'single' | 'total'

// Why the exercise is in the plan — authored from design/training-theory.md.
// Surfaced by describeExerciseChoice / explainRepTarget, so it reaches the
// "Explain why" panel and the Program Guide without any view knowing about it.
export interface ExerciseRationale {
  /** One or two sentences: purpose / muscles / role in the program. */
  purpose: string
  /** Only where the rep scheme deviates from the standard bands (e.g. Face Pull 15s). */
  repScheme?: string
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
  // Optional (plan v5): older stored plan rows and AI proposals may lack them.
  // Absent load on a weighted exercise = unlabeled, renders as plain "kg".
  load?: LoadMode
  rationale?: ExerciseRationale
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
        load: 'perHand',
        rationale: {
          purpose: 'Unilateral leg strength: quads and glutes, plus the balance and hip stability a two-legged squat hides.',
        },
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
        load: 'perHand',
        rationale: {
          purpose: 'The horizontal push: chest, front delts and triceps. Dumbbells keep left and right honest and need no spotter.',
        },
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
        load: 'total',
        rationale: {
          purpose: 'The hinge: hamstrings, glutes and the muscles that guard your lower back.',
          repScheme: 'Reps lag the other compounds (10-10-8, never 6) on purpose: hinge form is the first thing to go at low reps and high load, so every rep stays submaximal - reduce weight, not reps.',
        },
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
        load: 'perHand',
        rationale: {
          purpose: 'The vertical push: shoulders and triceps. Seated so the lower back stays out of it.',
        },
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
        rationale: {
          purpose: 'Anti-extension core: endurance for the trunk brace that protects the RDL and the presses. Progress is seconds, not load.',
        },
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
        rationale: {
          purpose: 'Anti-side-bend core: obliques and the deep trunk muscles, one side at a time. Shorter holds than the front plank because the side position is harder.',
        },
        repProgression: {
          band1: { sets: 2, seconds: 20 },
          band2: { sets: 2, seconds: 30 },
          band3: { sets: 2, seconds: 40 },
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
        load: 'single',
        rationale: {
          purpose: 'Calves respond to full range - deep stretch at the bottom, a pause tall on the toes - more than to heavy load.',
          repScheme: 'Reps hold at 3 x 12 in every band; from band 3 you hold one dumbbell instead of adding reps.',
        },
        repProgression: {
          band1: { sets: 3, reps: 12 },
          band2: { sets: 3, reps: 12 },
          band3: { sets: 3, reps: 12, addLoad: true },
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
        load: 'total',
        rationale: {
          purpose: 'Bilateral quad strength without a balance ceiling: the machine lets the legs be loaded heavier than the lunge, so it progresses in bigger steps.',
        },
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
        load: 'single',
        rationale: {
          purpose: 'The horizontal pull: lats, upper back and rear delts. One arm at a time with a hand on the bench keeps the lower back out of it.',
        },
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
        load: 'total',
        rationale: {
          purpose: 'The vertical pull: lats and biceps - the pull-up you can progress from day one.',
        },
        repProgression: {
          band1: { sets: 3, reps: 10 },
          band2: { sets: 3, reps: 8 },
          band3: { sets: 4, reps: 6 },
        },
      },
      {
        id: 'back-extension',
        name: 'Back Extension',
        sets: 3,
        reps: 12,
        progressionType: 'dumbbell',
        requiresKg: true,
        videoUrls: [
          'https://www.youtube.com/shorts/hORc0tXXmY4', // Hailey Happens Fitness - 45 Degree Back Extensions
          'https://www.youtube.com/shorts/8rXdAAwm8Rs', // DeltaBolic - hyperextension differences
          'https://www.youtube.com/shorts/H8Swl1N-uis', // Squat University - common mistakes
        ],
        alternatives: ['Bird dog', 'Superman hold'],
        notes: 'Hinge over the pad with a flat back; squeeze glutes to come up, stop in line with your body - no overextending. Hold a plate or dumbbell to your chest for load.',
        safetyCues: ['back'],
        load: 'single',
        rationale: {
          purpose: 'Direct lower-back and glute work on the 45-degree bench: the hinge pattern Workout B was missing, balancing the RDL on Workout A across the week.',
          repScheme: 'Stays at 3 x 12 in every band: like the RDL, the hinge stays submaximal - progress by holding a little more weight, never by grinding low reps.',
        },
        repProgression: {
          band1: { sets: 3, reps: 12 },
          band2: { sets: 3, reps: 12 },
          band3: { sets: 3, reps: 12 },
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
        load: 'perHand',
        rationale: {
          purpose: 'Direct biceps work on top of the pulling they already do in rows and pulldowns.',
          repScheme: 'Fixed 2 x 12 in every band: isolation lifts stay out of low-rep ranges (elbow stress, no technique payoff). Progress is weight only, and slowly.',
        },
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
        load: 'single',
        rationale: {
          purpose: 'Direct triceps work, overhead to reach the long head that pressing misses.',
          repScheme: 'Fixed 2 x 12 like the curl: isolation stays higher-rep and progresses by weight only.',
        },
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
        load: 'total',
        rationale: {
          purpose: 'Anti-rotation core: resisting the cable\'s twist trains the trunk to stay square under load.',
          repScheme: 'Reps hold at 3 x 10 - the point is a controlled press and a brief hold, so band 3 adds stack weight instead of reps.',
        },
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
        load: 'total',
        rationale: {
          purpose: 'Shoulder health, not strength: rear delts, mid traps and the rotator cuff, balancing all the pressing in the plan. It joins at week 9 because it exists to offset pressing volume you have not accumulated yet.',
          repScheme: 'High reps on purpose: these small muscles need light load, and light load needs 15 reps to be a stimulus. Loaded heavy, momentum takes over and the shoulder-health purpose is lost. Band 3 drops to 12 only because the stack has crept up by then.',
        },
        repProgression: {
          // Band 1 is reachable: once trained, Face Pull stays in the plan even
          // if the program week falls back below 9 (missed weeks, or the start
          // date moved forward), and the rep band follows the lower week.
          band1: { sets: 3, reps: 15 },
          band2: { sets: 3, reps: 15 },
          band3: { sets: 3, reps: 12 },
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
  // v2: reverse plank in warmups (migration 6); v3: side plank + calf raise (7);
  // v4: calf raise moved B -> A (9); v5: load modes + rationale (10);
  // v6: back extension joins B (11)
  version: 6,
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

/**
 * Why this exercise is in today's workout — the plan-side half of "Explain why".
 * Mirrors the filter in `getWorkoutExercises`, so the copy cannot claim a reason
 * the selection logic does not actually use.
 */
export function describeExerciseChoice(
  exercise: ExerciseDef,
  programWeek: number,
  loggedIds: ReadonlySet<string> = NO_LOGGED_IDS,
): string {
  const workout = getPlan().workouts.find(w => w.exercises.some(e => e.id === exercise.id))
  const where = workout ? `Workout ${workout.id} (${workout.name})` : 'this workout'
  // Rationale is optional (older plan rows / AI proposals) — without it the
  // text is exactly what it was before rationale existed.
  const purpose = exercise.rationale?.purpose ? `${exercise.rationale.purpose} ` : ''
  const base = `${purpose}${exercise.name} is part of ${where}, which the calendar prescribes for today.`
  const alts = exercise.alternatives.length
    ? ` If the equipment is taken or it does not feel right, ${exercise.alternatives.join(' or ')} covers the same job.`
    : ''
  if (exercise.minWeek) {
    const ramped = programWeek >= exercise.minWeek
      ? `It joins the plan from program week ${exercise.minWeek}; you are at week ${programWeek}.`
      : loggedIds.has(exercise.id)
        ? `It normally starts at program week ${exercise.minWeek} and you are at week ${programWeek}, but you have already trained it - once trained it stays in the plan.`
        : `It starts at program week ${exercise.minWeek}.`
    return `${base} ${ramped}${alts}`
  }
  return `${base}${alts}`
}

export function getExercise(id: string): ExerciseDef | undefined {
  return getPlan().workouts.flatMap(w => w.exercises).find(e => e.id === id)
}

// ---------------------------------------------------------------------------
// Load-mode display helpers — the single place the perHand/single/total
// convention is turned into text, shared by every weight display site
// (loggers, history, milestones, explain-why, program guide).
// ---------------------------------------------------------------------------

/** Compact suffix after a number: '12kg/hand', '12kg (1 DB)', '60kg'. */
export function loadSuffix(ex: Pick<ExerciseDef, 'load'>): string {
  switch (ex.load) {
    case 'perHand': return '/hand'
    case 'single': return ' (1 DB)'
    default: return ''
  }
}

/** Input-field caption, v2 cards: 'KG/HAND', 'KG (1 DB)', 'KG'. */
export function kgCaption(ex: Pick<ExerciseDef, 'load'>): string {
  return `KG${loadSuffix(ex).toUpperCase()}`
}

/**
 * Full sentence for the "Explain why" panel and the Program Guide, or null
 * when there is nothing to say (unweighted, or an unlabeled plan-row exercise).
 */
export function describeLoadMode(ex: Pick<ExerciseDef, 'load' | 'requiresKg'>): string | null {
  if (!ex.requiresKg) return null
  switch (ex.load) {
    case 'perHand':
      return 'The weight you enter is per dumbbell - one in each hand, so 12kg means 2 x 12kg carried.'
    case 'single':
      return 'The weight you enter is the one dumbbell you use - whether held in both hands or one side at a time.'
    case 'total':
      return 'The weight you enter is the total load - the whole stack or bar.'
    default:
      return null
  }
}

export const QUALITATIVE_MILESTONES = [
  { id: 'bike-commute-easy', label: 'Bike commute feels easy' },
  { id: 'posture-improved', label: 'Posture visibly improved' },
  { id: 'energy-up', label: 'Daily energy noticeably higher' },
  { id: 'sleep-quality', label: 'Sleep quality improved' },
  { id: 'shoulder-mobility', label: 'Shoulder mobility improved' },
]
