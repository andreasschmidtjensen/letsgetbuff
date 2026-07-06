import { useState } from 'react'

// Lite YouTube embed: shows the thumbnail as a tap target and only loads the
// (heavy, cookie-setting) iframe once the user actually plays. Uses
// youtube-nocookie.com so no tracking cookie is set unless played. If the
// thumbnail 404s (removed/private video) we degrade to the written cues that
// the card already renders below the embed, plus a plain link.
//
// `vertical` renders a 9:16 box (Shorts) capped at 240px wide so it doesn't
// fill the whole phone screen. Shorts get the portrait oar2.jpg thumbnail
// first; if that's missing we retry the universal hqdefault.jpg before giving
// up on the video entirely.
export default function YouTubeEmbed({ videoId, title, vertical }: { videoId: string; title: string; vertical?: boolean }) {
  const [playing, setPlaying] = useState(false)
  // 0 = preferred thumb, 1 = fallback thumb (vertical only), 2 = broken
  const [thumbStep, setThumbStep] = useState(0)

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
  const broken = thumbStep >= 2

  if (broken) {
    return (
      <div className="muted" style={{ fontSize: 12 }}>
        Video unavailable — follow the written cues below.{' '}
        <a className="video-link" href={watchUrl} target="_blank" rel="noopener noreferrer">Open on YouTube ↗</a>
      </div>
    )
  }

  const box: React.CSSProperties = vertical
    ? {
        position: 'relative', width: 'min(100%, 240px)', aspectRatio: '9 / 16',
        margin: '0 auto', borderRadius: 8, overflow: 'hidden',
        background: 'var(--surface)', border: '1px solid var(--border)',
      }
    : {
        position: 'relative', width: '100%', aspectRatio: '16 / 9',
        borderRadius: 8, overflow: 'hidden', background: 'var(--surface)',
        border: '1px solid var(--border)',
      }

  if (playing) {
    return (
      <div style={box}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          loading="lazy"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
        />
      </div>
    )
  }

  const thumbSrc = vertical && thumbStep === 0
    ? `https://i.ytimg.com/vi/${videoId}/oar2.jpg`
    : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Play video: ${title}`}
      style={{ ...box, padding: 0, cursor: 'pointer', display: 'block' }}
    >
      <img
        src={thumbSrc}
        alt=""
        loading="lazy"
        onError={() => setThumbStep(s => (vertical ? s + 1 : 2))}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      <span
        aria-hidden="true"
        style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 52, height: 52, borderRadius: '50%', background: 'rgba(0,0,0,0.6)',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, paddingLeft: 3,
        }}
      >▶</span>
    </button>
  )
}
