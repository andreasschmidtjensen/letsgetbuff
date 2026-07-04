import { useState } from 'react'

// Lite YouTube embed: shows the thumbnail as a tap target and only loads the
// (heavy, cookie-setting) iframe once the user actually plays. Uses
// youtube-nocookie.com so no tracking cookie is set unless played. If the
// thumbnail 404s (removed/private video) we degrade to the written cues that
// StretchCard already renders below the embed, plus a plain link.
export default function YouTubeEmbed({ videoId, title }: { videoId: string; title: string }) {
  const [playing, setPlaying] = useState(false)
  const [broken, setBroken] = useState(false)

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`

  if (broken) {
    return (
      <div className="muted" style={{ fontSize: 12 }}>
        Video unavailable — follow the written cues below.{' '}
        <a className="video-link" href={watchUrl} target="_blank" rel="noopener noreferrer">Open on YouTube ↗</a>
      </div>
    )
  }

  const box: React.CSSProperties = {
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

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Play video: ${title}`}
      style={{ ...box, padding: 0, cursor: 'pointer', display: 'block' }}
    >
      <img
        src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
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
