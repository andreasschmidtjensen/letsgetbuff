import { useState } from 'react'
import { DndContext, closestCenter, DragEndEvent, SensorDescriptor, SensorOptions } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ExerciseDef } from '@letsgetbuff/shared'
import { repTargetFor } from '@letsgetbuff/shared'
import { ExerciseTimer } from '../timers'
import { formatDuration, WarmupStep } from '../helpers'
import { getRestMode } from './restMode'
import { formatElapsed } from './sessionClock'
import UiVersionChip from './UiVersionChip'

/**
 * Workout overview v2 — the start line, not a second logging surface. Everything
 * you need before the first set (who is training, warm-up, the order, one big
 * Start) and nothing you only need during it: the safety banner, "felt easy",
 * notes and the finish button all live in focus mode now.
 */

interface OrderRowProps {
  exercise: ExerciseDef
  index: number
  programWeek: number
  belowFold: boolean
}

function OrderRow({ exercise, index, programWeek, belowFold }: OrderRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: exercise.id })
  const target = repTargetFor(exercise, programWeek)
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : belowFold ? 0.55 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} className="v2-order-row">
      <button className="v2-order-handle" aria-label={`Drag to reorder ${exercise.name}`} {...listeners} {...attributes}>⠿</button>
      <span className="v2-order-idx">{index + 1}</span>
      <span className="v2-order-name">{exercise.name}</span>
      <span className="v2-order-meta">
        {target.sets}×{target.seconds ?? target.reps} · {getRestMode(exercise) === 'together' ? 'together' : 'turns'}
      </span>
    </div>
  )
}

interface WorkoutOverviewV2Props {
  workoutType: 'A' | 'B'
  workoutName: string
  dateStr: string
  todayStr: string
  onDateChange: (date: string) => void
  onWorkoutTypeChange: (t: 'A' | 'B') => void
  programWeek: number
  exercises: ExerciseDef[]
  liveOrder: string[]
  sensors: SensorDescriptor<SensorOptions>[]
  onDragEnd: (e: DragEndEvent) => void
  warmup: WarmupStep[] | null
  warmupText?: string
  onStart: () => void
  username: string
  partnerName: string | null
  onChangeParticipants: () => void
  audioCtx: AudioContext | null
  onAudioCtxInit: () => AudioContext
  muted: boolean
  liveHint: string
  readOnly?: boolean
  /** The day is marked done — focus mode's Finish sets this. */
  done: boolean
  onUndoDone: () => void
  /** How long the finished session took, when it was measured. */
  durationSec?: number
}

export default function WorkoutOverviewV2(props: WorkoutOverviewV2Props) {
  const {
    workoutType, workoutName, dateStr, todayStr, onDateChange, onWorkoutTypeChange, programWeek,
    exercises, liveOrder, sensors, onDragEnd, warmup, warmupText, onStart, username, partnerName,
    onChangeParticipants, audioCtx, onAudioCtxInit, muted, liveHint, readOnly, done, onUndoDone,
    durationSec,
  } = props

  const [editDate, setEditDate] = useState(false)
  const [warmupDone, setWarmupDone] = useState<boolean[]>(() => (warmup ?? []).map(() => false))
  const [timingIdx, setTimingIdx] = useState<number | null>(null)

  const steps = warmup ?? []
  const warmupMinutes = Math.round(steps.reduce((n, s) => n + s.seconds, 0) / 60)
  const doneCount = warmupDone.filter(Boolean).length

  const dateLabel = new Date(`${dateStr}T00:00:00`)
    .toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: '2-digit' })
    .toUpperCase()

  return (
    <div className="view-narrow ui-v2 v2-overview">
      {timingIdx !== null && (
        <ExerciseTimer
          targetSecs={steps[timingIdx].seconds}
          onComplete={() => { setWarmupDone(d => d.map((v, i) => (i === timingIdx ? true : v))); setTimingIdx(null) }}
          onCancel={() => setTimingIdx(null)}
          audioCtx={audioCtx}
          onAudioCtxInit={onAudioCtxInit}
          muted={muted}
        />
      )}

      <div className="v2-ov-head">
        <h2 className="v2-ov-title">Workout {workoutType}</h2>
        <UiVersionChip />
      </div>
      <div className="v2-ov-sub">{workoutName}</div>

      <div className="v2-meta-row">
        <button className="v2-meta-chip" onClick={() => setEditDate(v => !v)} aria-expanded={editDate}>{dateLabel}</button>
        <span className="v2-meta-chip">WEEK {programWeek}/26</span>
        <span className="v2-meta-chip">{exercises.length} EXERCISES</span>
        <button
          className="v2-meta-chip"
          onClick={() => onWorkoutTypeChange(workoutType === 'A' ? 'B' : 'A')}
          aria-label={`Switch to workout ${workoutType === 'A' ? 'B' : 'A'}`}
        >
          → {workoutType === 'A' ? 'B' : 'A'}
        </button>
      </div>
      {editDate && (
        <input
          type="date"
          className="input mb-12"
          value={dateStr}
          max={todayStr}
          onChange={e => { onDateChange(e.target.value); setEditDate(false) }}
          aria-label="Session date"
        />
      )}

      <div className="v2-card">
        <div className="v2-cap">TRAINING</div>
        <div className="v2-pill-row">
          <span className="v2-pill v2-pill-you">{username}</span>
          {partnerName && <span className="v2-pill v2-pill-partner">{partnerName}</span>}
          <button className="v2-text-btn" onClick={onChangeParticipants}>change</button>
        </div>
      </div>

      {steps.length > 0 ? (
        <div className="v2-card">
          <div className="v2-cap-row">
            <span className="v2-cap">WARM-UP · {warmupMinutes} MIN</span>
            <span className="v2-cap">{doneCount}/{steps.length}</span>
          </div>
          <div className="v2-warm-row">
            {steps.map((s, i) => (
              <button
                key={i}
                className={`v2-warm-tile${warmupDone[i] ? ' v2-warm-done' : ''}`}
                onClick={() => setTimingIdx(i)}
                aria-label={`Start ${formatDuration(s.seconds)} warm-up: ${s.label}`}
              >
                <span className="v2-warm-dur">{formatDuration(s.seconds)}</span>
                <span className="v2-warm-label">{s.label.replace(/\d+\s*-?\s*(min|sec|second|minute)[a-z]*/gi, '').trim().split(/\s+/).slice(0, 2).join(' ') || 'step'}</span>
              </button>
            ))}
          </div>
        </div>
      ) : warmupText ? (
        <div className="v2-card"><span className="v2-cap">WARM-UP</span><div className="v2-warm-text">{warmupText}</div></div>
      ) : null}

      <button className="v2-start" onClick={onStart} disabled={exercises.length === 0 || readOnly}>
        {done ? '▶ Reopen session' : '▶ Start session'}
      </button>
      {done && (
        <div className="v2-done-card">
          <div>
            <div className="v2-done-cap">SESSION DONE ✓</div>
            {durationSec !== undefined && <div className="v2-done-time">{formatElapsed(durationSec)}</div>}
          </div>
          <button className="v2-text-btn" onClick={onUndoDone}>undo</button>
        </div>
      )}

      <div className="v2-cap-row">
        <span className="v2-cap">ORDER</span>
        <span className="v2-cap">{liveHint}</span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={liveOrder} strategy={verticalListSortingStrategy}>
          {exercises.map((ex, i) => (
            <OrderRow key={ex.id} exercise={ex} index={i} programWeek={programWeek} belowFold={i >= 5} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
}
