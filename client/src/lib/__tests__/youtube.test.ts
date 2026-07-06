/**
 * Phase 21 — parseYouTubeUrl. Full exercise videoUrls (Shorts, watch, youtu.be)
 * map to a bare videoId + orientation; anything else → null (external link).
 */

import { test, expect } from 'vitest'
import { parseYouTubeUrl } from '../youtube'

test('shorts URL → id + vertical', () => {
  expect(parseYouTubeUrl('https://www.youtube.com/shorts/Rkkc-FnURyc'))
    .toEqual({ videoId: 'Rkkc-FnURyc', vertical: true })
})

test('watch URL → id, horizontal', () => {
  expect(parseYouTubeUrl('https://www.youtube.com/watch?v=amLSSb8cXok'))
    .toEqual({ videoId: 'amLSSb8cXok', vertical: false })
})

test('youtu.be and embed forms → horizontal', () => {
  expect(parseYouTubeUrl('https://youtu.be/amLSSb8cXok'))
    .toEqual({ videoId: 'amLSSb8cXok', vertical: false })
  expect(parseYouTubeUrl('https://www.youtube-nocookie.com/embed/amLSSb8cXok'))
    .toEqual({ videoId: 'amLSSb8cXok', vertical: false })
})

test('m.youtube.com shorts, extra params, trailing slash', () => {
  expect(parseYouTubeUrl('https://m.youtube.com/shorts/Rkkc-FnURyc/?feature=share'))
    .toEqual({ videoId: 'Rkkc-FnURyc', vertical: true })
  expect(parseYouTubeUrl('https://www.youtube.com/watch?v=amLSSb8cXok&t=30s'))
    .toEqual({ videoId: 'amLSSb8cXok', vertical: false })
})

test('non-YouTube, non-https, garbage, bad ids → null', () => {
  expect(parseYouTubeUrl('https://vimeo.com/12345678')).toBeNull()
  expect(parseYouTubeUrl('http://www.youtube.com/watch?v=amLSSb8cXok')).toBeNull()
  expect(parseYouTubeUrl('not a url')).toBeNull()
  expect(parseYouTubeUrl('https://www.youtube.com/watch?v=short')).toBeNull()
  expect(parseYouTubeUrl('https://www.youtube.com/watch')).toBeNull()
  expect(parseYouTubeUrl('https://www.youtube.com/shorts/')).toBeNull()
  expect(parseYouTubeUrl('https://www.youtube.com/playlist?list=PL123')).toBeNull()
})
