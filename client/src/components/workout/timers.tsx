import { useState, useEffect, useRef } from 'react'
import CountdownTimer from '../CountdownTimer'
import YouTubeEmbed from '../YouTubeEmbed'
import { parseYouTubeUrl } from '../../lib/youtube'
import { formatDuration } from './helpers'

// Small presentational pieces of the workout floor. RestTimer/ExerciseTimer are
// thin wrappers over the shared <CountdownTimer> overlay (Phase 20 item 9).

export function SessionTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(id)
  }, [startedAt])
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  return (
    <span className="muted" style={{ fontSize: 12 }} aria-live="off" aria-label={`Session time: ${mins} minutes ${secs} seconds`}>
      {mins}:{secs.toString().padStart(2, '0')}
    </span>
  )
}

interface RestTimerProps {
  defaultSecs: number
  onDismiss: () => void
  audioCtx: AudioContext | null
  muted: boolean
}

export function RestTimer({ defaultSecs, onDismiss, audioCtx, muted }: RestTimerProps) {
  return (
    <CountdownTimer
      seconds={defaultSecs}
      title="Rest"
      doneTitle="Rest done!"
      ariaLabel="Rest timer"
      audioCtx={audioCtx}
      muted={muted}
      renderFooter={(t) => (
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={onDismiss}>
          {t.remaining <= 0 ? 'Next set' : 'Skip rest'}
        </button>
      )}
    />
  )
}

interface ExerciseTimerProps {
  targetSecs: number
  onComplete: (achievedSecs: number) => void
  onCancel: () => void
  audioCtx: AudioContext | null
  onAudioCtxInit: () => AudioContext
  muted: boolean
}

// Active count-down for a timed exercise set (e.g. Plank). Mirrors RestTimer but
// reports the achieved seconds back so the set can be logged. Length is adjustable
// on the fly (±15s). Completes naturally at 0, or early via "Done".
export function ExerciseTimer({ targetSecs, onComplete, onCancel, audioCtx, onAudioCtxInit, muted }: ExerciseTimerProps) {
  return (
    <CountdownTimer
      seconds={targetSecs}
      title="Hold"
      doneTitle="Done!"
      ariaLabel="Exercise timer"
      adjustAffectsTotal
      audioCtx={audioCtx}
      muted={muted}
      resolveAudioCtx={onAudioCtxInit}
      onComplete={onComplete}
      cardClass="exercise-timer-card"
      ringClass="exercise-timer-ring"
      timeClass="exercise-timer-time"
      renderFooter={(t) => (
        <div className="rest-timer-adj" style={{ marginTop: 8 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onCancel} aria-label="Cancel timer">Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => { t.stop(); onComplete(t.achieved()) }} aria-label="Log time and finish set">Done</button>
        </div>
      )}
    />
  )
}

interface WarmupCardProps {
  warmup: { label: string; seconds: number }
  done: boolean
  onDone: () => void
  audioCtx: AudioContext | null
  onAudioCtxInit: () => AudioContext
  muted: boolean
}

// Warm-up slide for focus mode: the workout's cardio warm-up as a startable
// count-down timer. Not logged — it just gates the move to the first exercise.
export function WarmupCard({ warmup, done, onDone, audioCtx, onAudioCtxInit, muted }: WarmupCardProps) {
  const [timing, setTiming] = useState(false)
  return (
    <div className={`card exercise-card${done ? ' exercise-done' : ''}`} style={{ marginBottom: 10 }}>
      {timing && (
        <ExerciseTimer
          targetSecs={warmup.seconds}
          onComplete={() => { setTiming(false); onDone() }}
          onCancel={() => setTiming(false)}
          audioCtx={audioCtx}
          onAudioCtxInit={onAudioCtxInit}
          muted={muted}
        />
      )}
      <div className="row gap-8 mb-8">
        <span className="exercise-name">Warm-up</span>
        {done && <span className="badge badge-green" style={{ marginLeft: 'auto' }}>done</span>}
      </div>
      <p className="muted" style={{ fontSize: 15, marginBottom: 12 }}>{warmup.label}</p>
      <div className="set-inputs" role="group" aria-label="Warm-up timer">
        <button
          className="btn btn-primary btn-start-timer"
          onClick={() => setTiming(true)}
          aria-label={`Start ${formatDuration(warmup.seconds)} warm-up timer`}
        >
          ▶ Start {formatDuration(warmup.seconds)}
        </button>
        {!done && (
          <button className="btn-check" onClick={onDone} aria-label="Mark warm-up done">✓</button>
        )}
      </div>
    </div>
  )
}

export function VideoCarousel({ urls }: { urls: string[] }) {
  const [i, setI] = useState(0)
  const touchX = useRef<number | null>(null)
  if (urls.length === 0) return null
  if (urls.length === 1) {
    return <a className="video-link" href={urls[0]} target="_blank" rel="noopener noreferrer">Video</a>
  }
  const n = urls.length
  const go = (delta: number) => setI(prev => (prev + delta + n) % n)
  return (
    <div className="video-carousel" onTouchStart={e => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={e => {
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        if (Math.abs(dx) > 30) go(dx < 0 ? 1 : -1)
        touchX.current = null
      }}>
      <button className="vc-arrow" aria-label="Previous video" onClick={() => go(-1)}>‹</button>
      <a className="video-link" href={urls[i]} target="_blank" rel="noopener noreferrer">Video</a>
      <div className="vc-dots">
        {urls.map((_, idx) => (
          <button key={idx} className={`vc-dot${idx === i ? ' active' : ''}`}
            aria-label={`Video ${idx + 1}`} aria-current={idx === i} onClick={() => setI(idx)}>
            {idx + 1}
          </button>
        ))}
      </div>
      <button className="vc-arrow" aria-label="Next video" onClick={() => go(1)}>›</button>
    </div>
  )
}

// Embedded-video panel (Phase 21): the gym-exercise counterpart of the stretch
// embed. Renders the selected URL as a lite YouTube embed; URLs the parser
// can't handle (non-YouTube from AI discovery) keep the external-link
// behaviour for that slot. Navigation lives BELOW the embed because a playing
// iframe swallows touch events — dots/arrows are the reliable controls, with
// swipe supported on the nav strip itself.
export function VideoPanel({ urls, title }: { urls: string[]; title: string }) {
  const [i, setI] = useState(0)
  const touchX = useRef<number | null>(null)
  if (urls.length === 0) return null
  const n = urls.length
  const parsed = parseYouTubeUrl(urls[i])
  const go = (delta: number) => setI(prev => (prev + delta + n) % n)
  return (
    <div>
      {parsed ? (
        <YouTubeEmbed
          key={i}
          videoId={parsed.videoId}
          vertical={parsed.vertical}
          title={n > 1 ? `${title} — video ${i + 1} of ${n}` : title}
        />
      ) : (
        <a className="video-link" href={urls[i]} target="_blank" rel="noopener noreferrer">Open video ↗</a>
      )}
      {n > 1 && (
        <div className="video-panel-nav"
          onTouchStart={e => { touchX.current = e.touches[0].clientX }}
          onTouchEnd={e => {
            if (touchX.current === null) return
            const dx = e.changedTouches[0].clientX - touchX.current
            if (Math.abs(dx) > 30) go(dx < 0 ? 1 : -1)
            touchX.current = null
          }}>
          <button className="vc-arrow" aria-label="Previous video" onClick={() => go(-1)}>‹</button>
          <div className="vc-dots">
            {urls.map((_, idx) => (
              <button key={idx} className={`vc-dot${idx === i ? ' active' : ''}`}
                aria-label={`Video ${idx + 1}`} aria-current={idx === i} onClick={() => setI(idx)}>
                {idx + 1}
              </button>
            ))}
          </div>
          <button className="vc-arrow" aria-label="Next video" onClick={() => go(1)}>›</button>
        </div>
      )}
    </div>
  )
}
