// YouTube URL → embed data. Exercise videoUrls hold full URLs (Shorts preferred,
// but AI discovery only guarantees https://), while YouTubeEmbed needs a bare
// 11-char videoId. `null` means "not embeddable" — the caller keeps the plain
// external link for that URL. Shorts are vertical (9:16), everything else 16:9.

export interface ParsedYouTube {
  videoId: string
  vertical: boolean
}

const ID_RE = /^[A-Za-z0-9_-]{11}$/
const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com'])

export function parseYouTubeUrl(url: string): ParsedYouTube | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'https:') return null

  let id: string | null = null
  let vertical = false

  if (u.hostname === 'youtu.be') {
    id = u.pathname.split('/').filter(Boolean)[0] ?? null
  } else if (YT_HOSTS.has(u.hostname)) {
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts[0] === 'shorts' || parts[0] === 'embed') {
      id = parts[1] ?? null
      vertical = parts[0] === 'shorts'
    } else if (parts[0] === 'watch') {
      id = u.searchParams.get('v')
    }
  } else {
    return null
  }

  if (!id || !ID_RE.test(id)) return null
  return { videoId: id, vertical }
}
