// ─────────────────────────────────────────────────────────────────────────────
// Home workout catalog (issue #1) — plan-as-data, mirroring catalog/stretches.ts.
//
// A bodyweight-only circuit for days you can't get to the gym: no equipment,
// 10–15 minutes door to door. Timed intervals (not reps) so the whole thing
// runs off the shared countdown engine. Logged as a `home` ActivityEntry from
// the Home view — the Tue/Sat gym calendar is untouched.
// ─────────────────────────────────────────────────────────────────────────────

export interface HomeExercise {
  id: string
  name: string
  cues: string[]
  videoId: string // 11-char YouTube id — form demo shown on the Home training tab
}

export interface HomeWorkoutPlan {
  name: string
  rounds: number
  workSeconds: number
  restSeconds: number
  warmupSeconds: number
  exercises: HomeExercise[]
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
      name: 'Bodyweight squats',
      cues: ['Feet shoulder-width, toes slightly out', 'Sit back and down, chest up', 'Drive through the whole foot'],
      videoId: 'ZLJBfYF_oO0',
    },
    {
      id: 'push-up',
      name: 'Push-ups',
      cues: ['Hands under shoulders, body in one line', 'Lower with control, elbows ~45°', 'On knees or against a table to scale down'],
      videoId: 'WDIpL0pjun0',
    },
    {
      id: 'reverse-lunge',
      name: 'Reverse lunges',
      cues: ['Step back, drop the back knee toward the floor', 'Front shin vertical, torso tall', 'Alternate legs each rep'],
      videoId: 'u_zSfK5ZFU4',
    },
    {
      id: 'plank',
      name: 'Plank',
      cues: ['Forearms down, body in one straight line', 'Squeeze glutes, brace the belly', 'Breathe — don\'t hold your breath'],
      videoId: 'mwlp75MS6Rg',
    },
    {
      id: 'glute-bridge',
      name: 'Glute bridges',
      cues: ['On your back, heels close to hips', 'Drive hips up, squeeze at the top', 'Ribs down — don\'t arch the lower back'],
      videoId: '8bbE64NuDTU',
    },
    {
      id: 'mountain-climber',
      name: 'Mountain climbers',
      cues: ['Push-up position, drive knees to chest', 'Keep hips level, steady rhythm', 'Slow down rather than lose form'],
      videoId: 'cnyTQDSE884',
    },
  ],
}

// One flat, playable step list: warm-up, then rounds of work/rest. No rest
// after the final exercise of the final round.
export interface HomeStep {
  kind: 'warmup' | 'work' | 'rest'
  name: string
  seconds: number
  cues: string[]
  round: number // 0 for warm-up
  exerciseIndex: number // -1 for warm-up/rest
}

export function homeWorkoutSteps(plan: HomeWorkoutPlan = HOME_WORKOUT): HomeStep[] {
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
      steps.push({ kind: 'work', name: ex.name, seconds: plan.workSeconds, cues: ex.cues, round: r, exerciseIndex: i })
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
