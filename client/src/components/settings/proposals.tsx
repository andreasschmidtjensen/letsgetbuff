import { useState } from 'react'
import type { ExerciseDef } from '@letsgetbuff/shared'

export interface Proposal {
  id: number
  workoutId: 'A' | 'B'
  request: string
  exercise: ExerciseDef
  warnings?: string[]
  status: 'pending' | 'approved' | 'rejected'
  proposedAt: string
  reviewedAt: string | null
}

// ── ExerciseProposalCard ───────────────────────────────────────────────────────

export function ExerciseProposalCard({
  proposal,
  onApprove,
  onReject,
  busy,
}: {
  proposal: Proposal
  onApprove: (id: number) => void
  onReject: (id: number) => void
  busy: boolean
}) {
  const ex = proposal.exercise
  const statusColor =
    proposal.status === 'approved' ? 'var(--green)' :
    proposal.status === 'rejected' ? 'var(--text-muted)' :
    'var(--amber, #f59e0b)'

  return (
    <div
      className="card mb-8"
      style={{ borderLeft: `3px solid ${statusColor}`, opacity: proposal.status !== 'pending' ? 0.65 : 1 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{ex.name}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Workout {proposal.workoutId} · {ex.progressionType} ·{' '}
            {ex.reps === null ? `${ex.sets}×${ex.seconds}s` : `${ex.sets}×${ex.reps}`}
            {ex.perSide ? ' per side' : ''}
          </div>
        </div>
        <div className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
          {proposal.status === 'pending' ? 'Pending' : proposal.status === 'approved' ? '✓ Approved' : '✗ Rejected'}
        </div>
      </div>

      <p style={{ fontSize: 13, marginTop: 8, marginBottom: 6 }}>{ex.notes}</p>

      {(proposal.warnings?.length ?? 0) > 0 && (
        <div style={{
          marginBottom: 8,
          padding: '6px 10px',
          background: 'var(--accent-dim)',
          borderLeft: '3px solid var(--accent)',
          borderRadius: 4,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>⚠ Potentially problematic</div>
          {proposal.warnings!.map((w, i) => (
            <div key={i} style={{ fontSize: 12 }}>{w}</div>
          ))}
        </div>
      )}

      {ex.safetyCues.length > 0 && (
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
          ⚠ {ex.safetyCues.map(c =>
            c === 'knee' ? 'rough on the knees — monitor for discomfort' :
            c === 'back' ? 'loads the lower back — use strict form' : c
          ).join(' · ')}
        </div>
      )}

      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
        Alternatives: {ex.alternatives.join(', ')}
      </div>

      {ex.videoUrls.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {ex.videoUrls.map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, display: 'block', color: 'var(--primary)' }}
            >
              📹 Video {i + 1}
            </a>
          ))}
        </div>
      )}

      <div className="muted" style={{ fontSize: 11, marginBottom: 10 }}>
        Request: "{proposal.request}"
      </div>

      {proposal.status === 'pending' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => onApprove(proposal.id)}
          >
            ✓ Add to plan
          </button>
          <button
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={() => onReject(proposal.id)}
          >
            ✗ Reject
          </button>
        </div>
      )}
    </div>
  )
}

// ── ProposeExerciseForm ────────────────────────────────────────────────────────

export function ProposeExerciseForm({
  onProposed,
  aiConfigured,
}: {
  onProposed: (p: Proposal) => void
  aiConfigured: boolean | null
}) {
  const [workoutId, setWorkoutId] = useState<'A' | 'B'>('A')
  const [request, setRequest] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const disabled = aiConfigured === false

  const submit = async () => {
    if (!request.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/plan/propose', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workoutId, request: request.trim() }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data = (await res.json()) as { proposal: Proposal }
      onProposed(data.proposal)
      setRequest('')
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  if (disabled) {
    return (
      <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
        Claude API key not configured. An admin can add it in Settings.
      </p>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <label style={{ fontSize: 13, fontWeight: 500 }}>Workout</label>
        {(['A', 'B'] as const).map(w => (
          <button
            key={w}
            className={`btn btn-sm ${workoutId === w ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setWorkoutId(w)}
            aria-pressed={workoutId === w}
            disabled={aiConfigured === null}
          >
            {w}
          </button>
        ))}
      </div>
      <textarea
        className="input"
        style={{ width: '100%', minHeight: 72, marginBottom: 8, resize: 'vertical', fontSize: 13 }}
        placeholder='Describe the exercise you want, e.g. "add a rear-delt accessory" or "give us a unilateral hamstring exercise"'
        value={request}
        onChange={e => setRequest(e.target.value)}
        maxLength={500}
        disabled={aiConfigured === null}
      />
      <button
        className="btn btn-primary btn-sm"
        disabled={busy || !request.trim() || aiConfigured === null}
        onClick={submit}
      >
        {busy ? '🤖 Asking Claude…' : '🤖 Propose exercise'}
      </button>
      {error && (
        <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }}>{error}</p>
      )}
    </div>
  )
}
