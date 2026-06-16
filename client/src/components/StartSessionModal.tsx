/**
 * Phase 13 (F2) — Start-session prompt: train alone or with the other user.
 *
 * Strictly two users, so "with partner" is the single other privileged account.
 * The parent only renders this when a partner candidate exists (no candidate →
 * the parent goes straight to solo). The user must make an explicit choice — there
 * is no silent default.
 */

import { useEffect, useRef } from 'react'

interface Props {
  partner?: { username: string } | null
  onChoose: (mode: 'solo' | 'shared', partnerUsername?: string) => void
  onCancel?: () => void
}

export default function StartSessionModal({ partner, onChoose, onCancel }: Props) {
  const firstBtn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    firstBtn.current?.focus()
  }, [])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Start workout session"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 20,
          maxWidth: 360,
          width: '100%',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 17, marginBottom: 6 }}>Start workout</div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
          {partner
            ? `Training alone, or with ${partner.username}?`
            : 'Start your workout.'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            ref={firstBtn}
            className="btn btn-secondary"
            style={{ padding: 14, fontSize: 16 }}
            onClick={() => onChoose('solo')}
          >
            🏋️ Train alone
          </button>
          {partner && (
            <button
              className="btn btn-primary"
              style={{ padding: 14, fontSize: 16 }}
              onClick={() => onChoose('shared', partner.username)}
            >
              👥 Train with {partner.username}
            </button>
          )}
          {onCancel && (
            <button
              className="btn btn-secondary"
              style={{ padding: 14, fontSize: 16 }}
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
