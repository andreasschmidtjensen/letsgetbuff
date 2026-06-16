/**
 * Phase 8 — Claude API exercise discovery.
 *
 * proposeExercise() calls Claude with tool_use to generate a schema-valid
 * ExerciseDef that follows the program's established guidelines. The result is
 * stored as a pending proposal; a human must approve before it enters the plan.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { ExerciseDef } from '@letsgetbuff/shared'
import { config } from './config.js'

// ---------------------------------------------------------------------------
// Guidelines prompt — encodes the program rules so generated exercises conform
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a personal trainer assistant helping to extend a two-person beginner strength programme.
The programme follows these rules exactly — generated exercises MUST conform:

## Equipment available
Dumbbells, cable machine, leg press, barbell (not used currently), bench, rowing machine.
No bodyweight-only exercises unless they are timed core work.

## Progression types (use exactly one):
- "dumbbell"    — bilateral or unilateral dumbbell work (requiresKg: true)
- "cable"       — cable machine (requiresKg: true)
- "legPress"    — leg press machine (requiresKg: true)
- "rdl"         — Romanian deadlift (special progression, requiresKg: true)
- "bodyweight"  — pure bodyweight, non-timed (requiresKg: false)
- "timed"       — timed holds / carries (reps: null, requiresKg: false unless weighted)

## Rep/set bands (repProgression is REQUIRED for all exercises):
Weighted exercises (dumbbell / cable / legPress / rdl):
  band1: 3 sets × 10 reps  (or 2 × 12 for arm isolation)
  band2: 3 sets × 8 reps   (or 2 × 12 for arm isolation)
  band3: 4 sets × 6 reps   (or 2 × 12 for arm isolation)

RDL exception:
  band1: 3 × 10, band2: 3 × 10, band3: 3 × 8

Timed exercises:
  band1: 3 × 30 s, band2: 3 × 45 s, band3: 3 × 60 s
  Set reps to null and provide seconds instead.

## Safety rules (HARD constraints):
- NO loaded spinal flexion (no crunches, sit-ups, good mornings with heavy load, Jefferson curls).
- Tag "knee" safetyCue for any exercise with knee-loading (lunges, squats, leg press variants, step-ups).
- Tag "back" safetyCue for any hip-hinge or overhead load (RDL, rows, shoulder press).
- Exercises with safetyCues must include a brief safety note in the "notes" field.

## Video URLs:
- Provide at least 1, ideally 2–3 YouTube Shorts URLs (https://www.youtube.com/shorts/ID).
- Fall back to a standard youtube.com watch URL only if Shorts are unavailable.
- Never invent video IDs — use well-known, real tutorial videos from reputable channels.
- If you are not certain a video ID is real, omit that URL rather than guess.

## IDs:
- Kebab-case, unique, descriptive (e.g. "cable-face-pull", "dumbbell-lateral-raise").

## Alternatives:
- 2–3 alternative exercise names (strings), no URLs needed.

## Notes:
- 1–2 coaching cues, concise. Include safety note if safetyCues is non-empty.`

// ---------------------------------------------------------------------------
// Tool definition — describes the ExerciseDef shape to Claude
// ---------------------------------------------------------------------------

const EXERCISE_TOOL: Anthropic.Tool = {
  name: 'propose_exercise',
  description:
    'Propose a new exercise to add to the programme. Must conform to all programme guidelines.',
  input_schema: {
    type: 'object' as const,
    required: [
      'id', 'name', 'sets', 'reps', 'progressionType',
      'requiresKg', 'videoUrls', 'alternatives', 'notes', 'safetyCues', 'repProgression',
    ],
    properties: {
      id: { type: 'string', description: 'Kebab-case unique identifier' },
      name: { type: 'string', description: 'Display name' },
      sets: { type: 'number' },
      reps: {
        anyOf: [{ type: 'number' }, { type: 'null' }],
        description: 'null for timed exercises',
      },
      seconds: {
        anyOf: [{ type: 'number' }, { type: 'null' }],
        description: 'Duration in seconds for timed exercises; omit for rep-based',
      },
      perSide: {
        type: 'boolean',
        description: 'true for unilateral exercises (e.g. single-arm row)',
      },
      progressionType: {
        type: 'string',
        enum: ['dumbbell', 'legPress', 'rdl', 'cable', 'bodyweight', 'timed'],
      },
      requiresKg: { type: 'boolean' },
      videoUrls: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        description: 'YouTube URLs, Shorts preferred',
      },
      alternatives: {
        type: 'array',
        items: { type: 'string' },
        minItems: 2,
      },
      notes: { type: 'string' },
      safetyCues: {
        type: 'array',
        items: { type: 'string', enum: ['knee', 'back'] },
      },
      minWeek: {
        type: 'number',
        description: 'Optional: programme week from which this exercise is first shown',
      },
      repProgression: {
        type: 'object',
        required: ['band1', 'band2', 'band3'],
        properties: {
          band1: {
            type: 'object',
            properties: {
              sets: { type: 'number' },
              reps: { type: 'number' },
              seconds: { type: 'number' },
              addLoad: { type: 'boolean' },
            },
            required: ['sets'],
          },
          band2: {
            type: 'object',
            properties: {
              sets: { type: 'number' },
              reps: { type: 'number' },
              seconds: { type: 'number' },
              addLoad: { type: 'boolean' },
            },
            required: ['sets'],
          },
          band3: {
            type: 'object',
            properties: {
              sets: { type: 'number' },
              reps: { type: 'number' },
              seconds: { type: 'number' },
              addLoad: { type: 'boolean' },
            },
            required: ['sets'],
          },
        },
      },
    },
  },
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isValidProgressionType(s: string): s is ExerciseDef['progressionType'] {
  return ['dumbbell', 'legPress', 'rdl', 'cable', 'bodyweight', 'timed'].includes(s)
}

function isValidSafetyCue(s: string): s is 'knee' | 'back' {
  return s === 'knee' || s === 'back'
}

export function validateExerciseDef(raw: unknown): ExerciseDef {
  if (typeof raw !== 'object' || raw === null) throw new Error('Not an object')
  const r = raw as Record<string, unknown>

  const required = ['id', 'name', 'progressionType', 'videoUrls', 'alternatives', 'notes', 'safetyCues', 'repProgression']
  for (const k of required) {
    if (!(k in r)) throw new Error(`Missing field: ${k}`)
  }
  if (typeof r.id !== 'string' || !/^[a-z0-9-]+$/.test(r.id)) throw new Error('id must be kebab-case')
  if (typeof r.name !== 'string') throw new Error('name must be string')
  if (!isValidProgressionType(r.progressionType as string)) throw new Error(`Invalid progressionType: ${r.progressionType}`)
  if (!Array.isArray(r.videoUrls) || r.videoUrls.length === 0) throw new Error('videoUrls must be non-empty array')
  for (const url of r.videoUrls as unknown[]) {
    if (typeof url !== 'string' || !url.startsWith('https://')) throw new Error(`Invalid videoUrl: ${url}`)
  }
  if (!Array.isArray(r.safetyCues)) throw new Error('safetyCues must be array')
  for (const c of r.safetyCues as unknown[]) {
    if (!isValidSafetyCue(c as string)) throw new Error(`Invalid safetyCue: ${c}`)
  }
  if (typeof r.repProgression !== 'object' || r.repProgression === null) throw new Error('repProgression required')
  const rp = r.repProgression as Record<string, unknown>
  if (!rp.band1 || !rp.band2 || !rp.band3) throw new Error('repProgression must have band1/band2/band3')

  // Safety rule: no loaded spinal flexion signals
  const forbidden = ['crunch', 'sit-up', 'situp', 'jefferson', 'good morning']
  const lower = (r.name as string).toLowerCase()
  for (const f of forbidden) {
    if (lower.includes(f)) throw new Error(`Safety violation: "${r.name}" resembles a forbidden movement (${f})`)
  }

  return {
    id: r.id as string,
    name: r.name as string,
    sets: typeof r.sets === 'number' ? r.sets : 3,
    reps: r.reps === null ? null : typeof r.reps === 'number' ? r.reps : 10,
    ...(r.seconds != null ? { seconds: r.seconds as number } : {}),
    ...(r.perSide != null ? { perSide: Boolean(r.perSide) } : {}),
    progressionType: r.progressionType as ExerciseDef['progressionType'],
    requiresKg: Boolean(r.requiresKg),
    videoUrls: r.videoUrls as string[],
    alternatives: r.alternatives as string[],
    notes: r.notes as string,
    safetyCues: r.safetyCues as Array<'knee' | 'back'>,
    ...(r.minWeek != null ? { minWeek: r.minWeek as number } : {}),
    repProgression: rp as ExerciseDef['repProgression'],
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Ask Claude to generate a new ExerciseDef matching the user's natural-language
 * request (e.g. "add a hamstring accessory" or "give us a shoulder finisher").
 *
 * Returns the validated candidate. Does NOT write to the DB — the caller
 * (api.ts) stores it as a pending proposal; a human approves later.
 */
export async function proposeExercise(
  workoutId: 'A' | 'B',
  request: string,
  existingExerciseIds: string[],
): Promise<ExerciseDef> {
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set — cannot call Claude API')
  }

  const client = new Anthropic({ apiKey: config.anthropicApiKey })

  const userMessage = `Workout ${workoutId} request: "${request}"

Current exercise IDs already in the plan (do NOT reuse these as your id): ${existingExerciseIds.join(', ')}

Generate one new exercise following all programme guidelines. Call the propose_exercise tool.`

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [EXERCISE_TOOL],
    tool_choice: { type: 'any' },
    messages: [{ role: 'user', content: userMessage }],
  })

  // Find the tool_use block
  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'propose_exercise',
  )
  if (!toolBlock) {
    throw new Error('Claude did not call the propose_exercise tool')
  }

  return validateExerciseDef(toolBlock.input)
}
