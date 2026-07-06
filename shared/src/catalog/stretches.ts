import type { StretchLevelId } from '../types.js'
import type { SafetyCue } from './exercises.js'

// ─────────────────────────────────────────────────────────────────────────────
// Stretch catalog (Phase 18, revised Phase 19) — plan-as-data, mirroring
// catalog/exercises.ts.
//
// Each level points at one curated YouTube video (`videoId`, the 11-char id).
// The client renders it with a lite-embed (thumbnail → iframe on tap). Video
// data is derived at render time only — it is never persisted in a StretchEntry
// — so changing it needs no reducer/migration/server-sync change.
// ─────────────────────────────────────────────────────────────────────────────

export type StretchArea =
  | 'hipFlexors' | 'quads' | 'hamstrings' | 'adductors' | 'glutes' | 'calves'
  | 'chest' | 'thoracic' | 'lats' | 'shoulders' | 'neck'

export type StretchKind = 'hold' | 'flow'

export interface StretchLevel {
  level: StretchLevelId
  name: string
  holdSeconds?: number      // hold stretches
  durationSeconds?: number  // flow stretches
  reps?: number             // flow stretches (optional)
  cues: string[]
  videoId: string           // 11-char YouTube id, curated per level variation
  vertical?: boolean        // true = YouTube Short (9:16); embed renders portrait
  progressNote: string
}

export interface StretchDef {
  id: string
  name: string
  kind: StretchKind
  area: StretchArea[]
  perSide: boolean
  safetyCues: SafetyCue[]
  startLevel: StretchLevelId
  levels: [StretchLevel, StretchLevel, StretchLevel]
}

export interface StretchRoutine {
  id: string
  name: string
  kind: StretchKind
  description: string
  stretches: StretchDef[]
}

export interface StretchSessionPlan { id: string; name: string; routineIds: string[] }

export interface StretchPlan {
  version: number
  routines: StretchRoutine[]
  sessions: StretchSessionPlan[]
}

// ── Builders ─────────────────────────────────────────────────────────────────

interface LevelText { name: string; secs: number; cues: string[]; videoId: string; vertical?: boolean; progressNote: string }

type BaseDef = { id: string; name: string; area: StretchArea[]; perSide: boolean; safetyCues: SafetyCue[] }

function holdStretch(def: BaseDef, texts: [LevelText, LevelText, LevelText]): StretchDef {
  const levels = texts.map((t, i) => ({
    level: (i + 1) as StretchLevelId, name: t.name,
    holdSeconds: t.secs, cues: t.cues, videoId: t.videoId, vertical: t.vertical, progressNote: t.progressNote,
  })) as [StretchLevel, StretchLevel, StretchLevel]
  return { id: def.id, name: def.name, kind: 'hold', area: def.area, perSide: def.perSide, safetyCues: def.safetyCues, startLevel: 1, levels }
}

function flowStretch(def: BaseDef, texts: [LevelText, LevelText, LevelText]): StretchDef {
  const levels = texts.map((t, i) => ({
    level: (i + 1) as StretchLevelId, name: t.name,
    durationSeconds: t.secs, cues: t.cues, videoId: t.videoId, vertical: t.vertical, progressNote: t.progressNote,
  })) as [StretchLevel, StretchLevel, StretchLevel]
  return { id: def.id, name: def.name, kind: 'flow', area: def.area, perSide: def.perSide, safetyCues: def.safetyCues, startLevel: 1, levels }
}

// ── Static-holds routine ─────────────────────────────────────────────────────

const HOLD_STRETCHES: StretchDef[] = [
  holdStretch(
    { id: 'quad', name: 'Quad / hip-front', area: ['quads', 'hipFlexors'], perSide: true, safetyCues: ['knee'] },
    [
      { name: 'Supported standing quad', secs: 25, cues: ['Hold a wall for balance', 'Heel to glute, knees together', 'Tuck the pelvis — no arching'], videoId: 'LHesB7TJW6c', vertical: true, progressNote: 'Ready when balance is easy and the heel reaches the glute.' },
      { name: 'Free-standing quad', secs: 30, cues: ['No support', 'Soft bend in the standing knee', 'Ribs down, glute squeezed'], videoId: 'AgaPoGEYTZ4', vertical: true, progressNote: 'Ready when you can hold steady and it feels mild.' },
      { name: 'Couch / elevated-foot quad', secs: 30, cues: ['Rear foot on a low step', 'Half-kneel, tall torso', 'Deeper hip-flexor + quad stretch'], videoId: 'cVqb6UdfIpM', vertical: true, progressNote: 'Top level — keep control and breathe.' },
    ],
  ),
  holdStretch(
    { id: 'hip-flexor', name: 'Hip flexors', area: ['hipFlexors'], perSide: true, safetyCues: ['back'] },
    [
      { name: 'Half-kneeling hip flexor', secs: 30, cues: ['Squeeze the back glute', 'Hips drift forward', 'Ribs down — no arch'], videoId: 'nJVogxD2eck', vertical: true, progressNote: 'Ready when the front of the hip stretches without low-back pinch.' },
      { name: '+ overhead reach & side-bend', secs: 30, cues: ['Same base position', 'Raise the same-side arm', 'Bend gently away'], videoId: 'cUfEiSZFVSY', vertical: true, progressNote: 'Ready when the reach feels controlled.' },
      { name: 'Couch-stretch hip flexor', secs: 30, cues: ['Rear shin up a wall/couch', 'Tall torso', 'Strong hip-flexor + quad'], videoId: 'TML8Vqy-ACQ', vertical: true, progressNote: 'Top level — ease in slowly.' },
    ],
  ),
  holdStretch(
    { id: 'hamstring', name: 'Hamstrings', area: ['hamstrings'], perSide: true, safetyCues: ['back'] },
    [
      { name: 'Standing flat-back hinge', secs: 25, cues: ['Heel forward, toes up', 'Hinge at the hips — FLAT BACK', 'Chest tall, hands on thigh'], videoId: 'LVY692zJK0A', progressNote: 'Ready when you reach mid-shin with a flat back.' },
      { name: 'Heel elevated, reach to shin', secs: 30, cues: ['Front heel on a low edge', 'Deeper flat-back hinge', 'Hands slide toward the shin'], videoId: 'Vlhz8JsVB6o', vertical: true, progressNote: 'Ready when the deeper hinge stays flat-backed.' },
      { name: 'Supported single-leg with strap', secs: 30, cues: ['Strap around the foot', 'Flat back, draw toes back', 'Controlled deeper range'], videoId: 'Cym2ki1eN2w', vertical: true, progressNote: 'Top level — never round the back.' },
    ],
  ),
  holdStretch(
    { id: 'adductor', name: 'Adductors (groin)', area: ['adductors'], perSide: false, safetyCues: ['knee'] },
    [
      { name: 'Seated butterfly', secs: 30, cues: ['Soles together', 'Sit tall, let the knees fall', 'Gentle'], videoId: '5A9mWxYxhGA', vertical: true, progressNote: 'Ready when the knees rest low comfortably.' },
      { name: 'Butterfly + flat-back hinge', secs: 30, cues: ['Hinge forward — flat back', 'Light elbow press on thighs'], videoId: 'dF2olILOtjM', vertical: true, progressNote: 'Ready when the forward hinge feels easy.' },
      { name: 'Supported side-lunge / Cossack', secs: 30, cues: ['Wide stance', 'Shift over a bent knee (knee over toes)', 'Other leg straight, heel down'], videoId: 'CRzkwy6x7fo', vertical: true, progressNote: 'Top level — hold support if needed.' },
    ],
  ),
  holdStretch(
    { id: 'glutes', name: 'Glutes / piriformis', area: ['glutes'], perSide: true, safetyCues: ['back'] },
    [
      { name: 'Lying figure-4', secs: 30, cues: ['Ankle over opposite knee', 'Draw the thigh in', 'Let the crossed knee fall open'], videoId: 'UFLUfFLSBCA', vertical: true, progressNote: 'Ready when you draw the thigh toward the chest easily.' },
      { name: 'Seated figure-4, flat-back lean', secs: 30, cues: ['In a chair, ankle on knee', 'Hinge forward — flat back'], videoId: 'tZ1-JBjT_wE', vertical: true, progressNote: 'Ready when the seated version feels mild.' },
      { name: 'Supported pigeon', secs: 30, cues: ['Front shin angled across', 'Hips square, weight off the knee', 'Ease forward'], videoId: 'Bj4kpvPkIIY', vertical: true, progressNote: 'Top level — deepest glute length.' },
    ],
  ),
  holdStretch(
    { id: 'calves', name: 'Calves', area: ['calves'], perSide: true, safetyCues: [] },
    [
      { name: 'Wall calf, straight leg', secs: 30, cues: ['Hands on wall', 'Back leg straight, heel down', 'Hips forward'], videoId: 'tUA4MO1kXV8', vertical: true, progressNote: 'Ready when the lean feels mild.' },
      { name: '+ bent-knee soleus', secs: 30, cues: ['Softly bend the back knee', 'Reach the lower calf'], videoId: 'vzg233ClYdU', vertical: true, progressNote: 'Ready when both variants feel easy.' },
      { name: 'Heel-drop off a step', secs: 30, cues: ['Forefoot on a step', 'Heel lowers below the edge', 'Hold a rail'], videoId: 'MABEKpLkRsI', vertical: true, progressNote: 'Top level — controlled range.' },
    ],
  ),
  holdStretch(
    { id: 'chest', name: 'Chest / pecs', area: ['chest', 'shoulders'], perSide: false, safetyCues: [] },
    [
      { name: 'Doorway, forearms low', secs: 30, cues: ['Forearms on the frame, low', 'Step through', 'Shoulders down and back'], videoId: 'CEQMx4zFwYs', progressNote: 'Ready when it feels mild and shoulders stay down.' },
      { name: 'Doorway at shoulder height', secs: 30, cues: ['Elbows ~shoulder height (goalpost)', 'Step through'], videoId: 'M850sCj9LHQ', progressNote: 'Ready when the higher angle feels easy.' },
      { name: 'Single-arm doorway, rotate away', secs: 30, cues: ['One arm on the frame', 'Rotate the torso away'], videoId: '9JXQZ3hcIRk', vertical: true, progressNote: 'Top level — deeper per-side.' },
    ],
  ),
  holdStretch(
    { id: 'thoracic', name: 'Thoracic rotation', area: ['thoracic', 'shoulders'], perSide: true, safetyCues: [] },
    [
      { name: 'Side-lying open-book', secs: 30, cues: ['Knees stacked and pinned', 'Top arm sweeps open', 'Eyes follow the hand'], videoId: 'qC7jBVTSrCg', vertical: true, progressNote: 'Ready when the top shoulder nears the floor.' },
      { name: 'Quadruped thread-the-needle', secs: 30, cues: ['On all fours', 'Thread one arm under, then reach up'], videoId: 'B8rLOWFLPqU', vertical: true, progressNote: 'Ready when rotation feels free.' },
      { name: 'Anchored seated twist', secs: 30, cues: ['Rotate and hold a fixed point', 'Tall spine'], videoId: 'sI44ZU33DjA', vertical: true, progressNote: 'Top level — segmental rotation.' },
    ],
  ),
  holdStretch(
    { id: 'lats', name: 'Lats / side-body', area: ['lats'], perSide: true, safetyCues: [] },
    [
      { name: 'Standing overhead side-bend', secs: 30, cues: ['Hand on hip', 'Reach the other arm up and lean away', 'Long spine'], videoId: 'Vko-SJok-fk', vertical: true, progressNote: 'Ready when the reach is easy and even.' },
      { name: 'Clasp wrist overhead, side-bend', secs: 30, cues: ['Opposite hand grips the wrist', 'Gently draw it over'], videoId: 'OX5NZLkidtY', progressNote: 'Ready when the deeper pull feels mild.' },
      { name: 'Anchored lat hang', secs: 30, cues: ['Hold a post/rail', 'Hips sit back and away', 'Arm long'], videoId: '2NyUgLEA-aI', vertical: true, progressNote: 'Top level — light traction.' },
    ],
  ),
  holdStretch(
    { id: 'shoulders', name: 'Shoulders', area: ['shoulders'], perSide: true, safetyCues: [] },
    [
      { name: 'Cross-body shoulder', secs: 30, cues: ['Draw the arm across the chest', 'Cradle the upper arm (not the elbow)', 'Shoulder down — no shrug'], videoId: 'aIq0fLi8iak', vertical: true, progressNote: 'Ready when the arm crosses easily, shoulder down.' },
      { name: 'Cross-body + deeper draw', secs: 30, cues: ['Draw slightly further', 'Tall posture, relaxed traps'], videoId: 'MzQYpR_QDss', vertical: true, progressNote: 'Ready when the deeper draw feels mild.' },
      { name: 'Supported sleeper stretch', secs: 30, cues: ['Side-lying, elbow out front', 'Gently rotate the forearm down', 'Stop at first tension'], videoId: 'dmAuJaoRH_o', vertical: true, progressNote: 'Top level — easy does it on the joint.' },
    ],
  ),
]

// ── Movement-flow routine ────────────────────────────────────────────────────

const FLOW_STRETCHES: StretchDef[] = [
  flowStretch(
    { id: 'cars-sequence', name: 'Joint CARs sequence', area: ['shoulders', 'hipFlexors', 'thoracic'], perSide: false, safetyCues: ['back'] },
    [
      { name: 'CARs — major joints', secs: 45, cues: ['Slow controlled circles', 'Neck, shoulders, hips, ankles', 'Biggest circle you can OWN'], videoId: 'jVy0u6m5_KU', progressNote: 'Ready when each circle is smooth and pain-free.' },
      { name: 'CARs — larger + spine & wrists', secs: 45, cues: ['Larger amplitude', 'Add segmental spine + wrists'], videoId: 'p_WqlqgfNrc', progressNote: 'Ready when amplitude is controlled throughout.' },
      { name: 'CARs — full end-range', secs: 45, cues: ['Full end-range circles', 'Brief active hold at end-range'], videoId: 'Y3h8VW-ILVc', progressNote: 'Top level — own your full range.' },
    ],
  ),
  flowStretch(
    { id: 'worlds-greatest', name: "World's Greatest Stretch", area: ['hipFlexors', 'thoracic', 'hamstrings', 'glutes'], perSide: false, safetyCues: ['knee', 'back'] },
    [
      { name: 'Supported lunge + rotation', secs: 40, cues: ['Hand down for support', 'Small open rotation', 'Back knee soft'], videoId: '-CiWQ2IvY34', progressNote: 'Ready when the lunge + rotation feel stable.' },
      { name: 'Full reach + elbow-to-instep', secs: 40, cues: ['Elbow toward the instep', 'Open reach to the sky'], videoId: 'PE-UuERblwA', vertical: true, progressNote: 'Ready when you reach tall with control.' },
      { name: '+ hamstring sweep', secs: 40, cues: ['Straighten the front leg', 'Sweep back over the hamstring', 'Slow tempo'], videoId: 'jCjs0e7hfys', vertical: true, progressNote: 'Top level — full integrated range.' },
    ],
  ),
  flowStretch(
    { id: 'deep-squat-sit', name: 'Deep-squat sit + reaches', area: ['hipFlexors', 'adductors', 'thoracic', 'calves'], perSide: false, safetyCues: ['knee'] },
    [
      { name: 'Assisted squat hold', secs: 50, cues: ['Hold support', 'Heels supported if needed', 'Knees track over toes'], videoId: 'w7R7gBRr2SI', vertical: true, progressNote: 'Ready when you sit comfortably at depth.' },
      { name: 'Deep squat + alternating reaches', secs: 50, cues: ['Bodyweight deep squat', 'Drive knees out', 'Alternate reaches'], videoId: 'UFLefaSyvfQ', vertical: true, progressNote: 'Ready when reaches stay balanced.' },
      { name: '+ thoracic rotations & pry', secs: 60, cues: ['Add thoracic rotations', 'Gentle pry with the elbows', 'Longer hold'], videoId: 'nIOI3OTf_64', vertical: true, progressNote: 'Top level — deep and controlled.' },
    ],
  ),
  flowStretch(
    { id: '90-90', name: '90/90 hip switches', area: ['glutes', 'hipFlexors'], perSide: false, safetyCues: ['knee'] },
    [
      { name: 'Small-range switches', secs: 45, cues: ['Hand support', 'Small controlled range', 'Both shins rotate'], videoId: 'CnpUyuEezIk', vertical: true, progressNote: 'Ready when switching feels smooth.' },
      { name: 'Full switches, unsupported', secs: 45, cues: ['No hands', 'Full range each side'], videoId: 'iPqysXFsvTQ', vertical: true, progressNote: 'Ready when unsupported switches are easy.' },
      { name: '+ lean & hover', secs: 45, cues: ['Flat-back lean over the front shin', 'Brief hover (active control)'], videoId: 'ghGZi98PB0g', vertical: true, progressNote: 'Top level — strong active control.' },
    ],
  ),
  flowStretch(
    { id: 'cossack-flow', name: 'Cossack squat flow', area: ['adductors', 'hipFlexors', 'calves'], perSide: false, safetyCues: ['knee', 'back'] },
    [
      { name: 'Shallow Cossack, supported', secs: 45, cues: ['Hold support', 'Shift side to side', 'Heel may lift'], videoId: 't0-vUUQCsAU', vertical: true, progressNote: 'Ready when the shift feels controlled.' },
      { name: 'Deeper, hands free', secs: 45, cues: ['Heel down', 'Hands free', 'Other leg straight'], videoId: 'VdN137mr2mM', vertical: true, progressNote: 'Ready when depth is comfortable.' },
      { name: 'Full depth + reach', secs: 45, cues: ['Foot flat at depth', 'Reach forward', 'Slow eccentric'], videoId: '0599krWPfoA', vertical: true, progressNote: 'Top level — full depth, controlled.' },
    ],
  ),
  flowStretch(
    { id: 'cat-cow-flow', name: 'Cat-cow → segmental flow', area: ['thoracic', 'shoulders'], perSide: false, safetyCues: ['back'] },
    [
      { name: 'Gentle cat-cow', secs: 45, cues: ['Quadruped spinal wave (unloaded)', 'Move slowly within comfort'], videoId: 'WHUevrqeKIg', vertical: true, progressNote: 'Ready when the wave feels smooth.' },
      { name: '+ thread-the-needle', secs: 45, cues: ['Add a reach-through', 'Open through the upper back'], videoId: 'UaDCTUQ5XAI', vertical: true, progressNote: 'Ready when reach-throughs feel free.' },
      { name: '+ side-body & segmental wave', secs: 45, cues: ['Add a side-body reach', 'Brief end-range pauses'], videoId: 'PzzSTDkIuww', vertical: true, progressNote: 'Top level — full segmental control.' },
    ],
  ),
]

// ── Routines, sessions, plan ─────────────────────────────────────────────────

export const MOVEMENT_FLOW_ROUTINE: StretchRoutine = {
  id: 'movement-flow', name: 'Movement flow', kind: 'flow',
  description: 'Active, full-range movement to open the joints and warm up. Doubles as the dynamic warm-up on training days.',
  stretches: FLOW_STRETCHES,
}

export const FULL_BODY_MOBILITY_ROUTINE: StretchRoutine = {
  id: 'full-body-mobility', name: 'Full-body mobility & flexibility', kind: 'hold',
  description: 'Targeted static holds, head-to-toe. Best done on warm tissue, after the flow.',
  stretches: HOLD_STRETCHES,
}

export const DEFAULT_STRETCH_PLAN: StretchPlan = {
  version: 3,
  routines: [MOVEMENT_FLOW_ROUTINE, FULL_BODY_MOBILITY_ROUTINE],
  sessions: [
    { id: 'daily', name: 'Flow + stretch', routineIds: ['movement-flow', 'full-body-mobility'] },
    { id: 'warmup', name: 'Warm-up flow', routineIds: ['movement-flow'] },
  ],
}

let _liveStretchPlan: StretchPlan | null = null
export function setLiveStretchPlan(plan: StretchPlan): void { _liveStretchPlan = plan }
export function getStretchPlan(): StretchPlan { return _liveStretchPlan ?? DEFAULT_STRETCH_PLAN }
export function getStretchRoutine(id: string): StretchRoutine | undefined { return getStretchPlan().routines.find(r => r.id === id) }
export function getStretch(id: string): StretchDef | undefined { return getStretchPlan().routines.flatMap(r => r.stretches).find(s => s.id === id) }
export function getStretchLevel(s: StretchDef, lvl: StretchLevelId): StretchLevel { return s.levels.find(l => l.level === lvl) ?? s.levels[0] }
export function getStretchSession(id: string): StretchSessionPlan | undefined { return getStretchPlan().sessions.find(s => s.id === id) }
export function getSessionStretches(id: string): StretchDef[] {
  const sp = getStretchSession(id)
  if (!sp) return []
  return sp.routineIds.flatMap(rid => getStretchRoutine(rid)?.stretches ?? [])
}
