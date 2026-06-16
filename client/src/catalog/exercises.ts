import type { ProgressionType } from '../types'

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
  minWeek?: number // Face Pull: only from week 9
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
    warmup: '10-minute elliptical',
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
    ],
  },
  {
    id: 'B',
    name: 'Pull & Quad',
    warmup: '10-minute rowing',
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
          band1: { sets: 3, reps: 15 }, // minWeek:9 means this won't be shown in band1
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
// versioned object) so a later phase can swap `getPlan()` to read from the
// server `plan` table (seeded from this same shape) without touching any view.
// ---------------------------------------------------------------------------

export interface Plan {
  version: number
  workouts: WorkoutDef[]
}

export const DEFAULT_PLAN: Plan = {
  version: 1,
  workouts: WORKOUTS,
}

// The single accessor for the active plan. Today it returns the seeded default;
// later phases replace the body to fetch the server-stored plan.
export function getPlan(): Plan {
  return DEFAULT_PLAN
}

export function getWorkout(id: 'A' | 'B'): WorkoutDef | undefined {
  return getPlan().workouts.find(w => w.id === id)
}

export function getWorkoutExercises(workout: 'A' | 'B', programWeek: number): ExerciseDef[] {
  const w = getWorkout(workout)
  if (!w) return []
  return w.exercises.filter(e => !e.minWeek || programWeek >= e.minWeek)
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
