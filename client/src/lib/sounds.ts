/**
 * Web Audio sound effects — all synthesized, no audio files.
 *
 * The timer-end alarm is user-selectable (Settings): a clean "beep" pair, or a
 * distorted heavy-metal power-chord strum. Stored per browser in localStorage.
 */

export type TimerSound = 'beep' | 'metal' | 'chirp' | 'moan' | 'shout'

export const TIMER_SOUNDS: { value: TimerSound; label: string }[] = [
  { value: 'beep',  label: 'Beep' },
  { value: 'metal', label: '🤘 Metal chord' },
  { value: 'chirp', label: '🐦 Bird chirp' },
  { value: 'moan',  label: '😳 Moan' },
  { value: 'shout', label: '🤬 Shout' },
]

const TIMER_SOUND_KEY = 'letsgetbuff-timer-sound'

export function getTimerSound(): TimerSound {
  const v = localStorage.getItem(TIMER_SOUND_KEY) as TimerSound | null
  return v && TIMER_SOUNDS.some(s => s.value === v) ? v : 'beep'
}

export function setTimerSound(s: TimerSound): void {
  localStorage.setItem(TIMER_SOUND_KEY, s)
}

/** Short sine tone. */
export function beep(ctx: AudioContext, freq = 880, duration = 0.12, vol = 0.4): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.frequency.value = freq
  gain.gain.setValueAtTime(vol, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + duration)
}

/** "Set logged" chime — two rising tones. */
export function playDoneSound(ctx: AudioContext): void {
  beep(ctx, 880, 0.1, 0.35)
  setTimeout(() => beep(ctx, 1100, 0.18, 0.3), 120)
}

// Soft-clip distortion curve for the power chord.
function makeDistortionCurve(amount: number): Float32Array {
  const n = 8192
  const curve = new Float32Array(n)
  const deg = Math.PI / 180
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x))
  }
  return curve
}

/** Distorted E power-chord downstroke (root + fifth + octave), ~1.5s ring-out. */
export function playMetalChord(ctx: AudioContext): void {
  const now = ctx.currentTime

  const shaper = ctx.createWaveShaper()
  shaper.curve = makeDistortionCurve(420)
  shaper.oversample = '4x'

  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 2600

  const master = ctx.createGain()
  master.gain.setValueAtTime(0.0001, now)
  master.gain.exponentialRampToValueAtTime(0.7, now + 0.015)   // pick attack
  master.gain.exponentialRampToValueAtTime(0.32, now + 0.18)   // body
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.4)  // ring-out

  shaper.connect(lp)
  lp.connect(master)
  master.connect(ctx.destination)

  // E2, B2, E3, B3 — power chord with octave doubling, sawtooth for harmonics.
  const freqs = [82.41, 123.47, 164.81, 246.94]
  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = f
    const g = ctx.createGain()
    g.gain.value = 0.3
    osc.connect(g)
    g.connect(shaper)
    osc.start(now + i * 0.022) // staggered = downstroke strum
    osc.stop(now + 1.5)
  })
}

/** A few quick tweets — synthesized bird chirp. */
export function playBirdChirp(ctx: AudioContext): void {
  const now = ctx.currentTime
  const chirp = (t: number, f0: number, f1: number, dur: number) => {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(f0, t)
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.35, t + dur * 0.2)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g)
    g.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + dur)
  }
  chirp(now,        2200, 3200, 0.08)
  chirp(now + 0.12, 2600, 3600, 0.07)
  chirp(now + 0.22, 3000, 2400, 0.10)
  chirp(now + 0.40, 2400, 3400, 0.08)
}

/** Stylized synthesized vocal "ahh" with vibrato — an approximate moan. */
export function playMoan(ctx: AudioContext): void {
  const now = ctx.currentTime
  const dur = 1.2

  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(230, now)
  osc.frequency.linearRampToValueAtTime(300, now + dur * 0.4)
  osc.frequency.linearRampToValueAtTime(210, now + dur)

  // Vibrato
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 6
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = 9
  lfo.connect(lfoGain)
  lfoGain.connect(osc.frequency)

  // Vowel formants (~"ah")
  const f1 = ctx.createBiquadFilter()
  f1.type = 'bandpass'; f1.frequency.value = 800; f1.Q.value = 8
  const f2 = ctx.createBiquadFilter()
  f2.type = 'bandpass'; f2.frequency.value = 1150; f2.Q.value = 10

  const amp = ctx.createGain()
  amp.gain.setValueAtTime(0.0001, now)
  amp.gain.exponentialRampToValueAtTime(0.5, now + 0.15)
  amp.gain.exponentialRampToValueAtTime(0.35, now + dur * 0.6)
  amp.gain.exponentialRampToValueAtTime(0.0001, now + dur)

  osc.connect(f1); osc.connect(f2)
  f1.connect(amp); f2.connect(amp)
  amp.connect(ctx.destination)

  osc.start(now); osc.stop(now + dur)
  lfo.start(now); lfo.stop(now + dur)
}

/** Speaks the word aloud via the browser's speech synthesis — an aggressive shout. */
export function playShout(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  const u = new SpeechSynthesisUtterance('Fuck!')
  u.rate = 1.15
  u.pitch = 0.5
  u.volume = 1
  const voices = window.speechSynthesis.getVoices()
  const v = voices.find(x => /^en[-_]/i.test(x.lang)) ?? voices[0]
  if (v) u.voice = v
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}

/** Alarm played when a rest / exercise timer runs out — honours the user's choice. */
export function playTimerEnd(ctx: AudioContext, sound: TimerSound = getTimerSound()): void {
  switch (sound) {
    case 'metal': playMetalChord(ctx); return
    case 'chirp': playBirdChirp(ctx); return
    case 'moan':  playMoan(ctx); return
    case 'shout': playShout(); return
    default:
      beep(ctx, 660, 0.08, 0.3)
      setTimeout(() => beep(ctx, 880, 0.15, 0.35), 100)
  }
}
