import { describe, it, expect, vi } from 'vitest'
import { ensureRunning, playTimerEndResilient, preloadTimerSounds, unlockCachedSounds } from '../sounds'

// A minimal AudioContext stand-in: enough graph for the default beep branch.
function fakeCtx(state: AudioContextState) {
  const node = { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), frequency: { value: 0 }, gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } }
  return {
    state,
    currentTime: 0,
    resume: vi.fn(function (this: { state: AudioContextState }) { this.state = 'running'; return Promise.resolve() }),
    createOscillator: vi.fn(() => ({ ...node })),
    createGain: vi.fn(() => ({ ...node })),
    destination: {},
  } as unknown as AudioContext & { resume: ReturnType<typeof vi.fn>; createOscillator: ReturnType<typeof vi.fn> }
}

describe('iOS audio resilience (v53)', () => {
  it('ensureRunning resumes a suspended context and tolerates null', async () => {
    await ensureRunning(null)
    const running = fakeCtx('running')
    await ensureRunning(running)
    expect(running.resume).not.toHaveBeenCalled()
    const suspended = fakeCtx('suspended')
    await ensureRunning(suspended)
    expect(suspended.resume).toHaveBeenCalled()
  })

  it('playTimerEndResilient resumes before playing (a suspended iOS context loses scheduled audio)', async () => {
    const ctx = fakeCtx('suspended')
    playTimerEndResilient(ctx, 'beep')
    await new Promise(r => setTimeout(r, 0)) // let the resume().then(play) chain run
    expect(ctx.resume).toHaveBeenCalled()
    expect(ctx.createOscillator).toHaveBeenCalled() // the beep actually fired
  })

  it('preload and unlock never throw without real media support (jsdom)', () => {
    expect(() => preloadTimerSounds()).not.toThrow()
    expect(() => unlockCachedSounds()).not.toThrow()
  })
})
