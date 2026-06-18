import { useEffect, useRef, useState } from 'react'
import type { StretchPose, CameraView } from '@letsgetbuff/shared'
import { useEinkMode } from '../store/einkMode'

type Pt = [number, number]
type LimbKey = 'armL' | 'armR' | 'legL' | 'legR'

const JOINTS: (keyof Omit<StretchPose, 'facing' | 'depth'>)[] = [
  'head', 'neck', 'hip', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR',
  'handL', 'handR', 'kneeL', 'kneeR', 'footL', 'footR',
]

function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

function lerpPose(a: StretchPose, b: StretchPose, t: number): StretchPose {
  const out = {} as StretchPose
  for (const k of JOINTS) out[k] = lerpPt(a[k] as Pt, b[k] as Pt, t)
  const src = t < 0.5 ? a : b
  if (src.facing) out.facing = src.facing
  if (src.depth) out.depth = src.depth
  return out
}

function ease(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2
}

function depthOf(pose: StretchPose, limb: LimbKey): 'near' | 'far' {
  return pose.depth?.[limb] ?? 'near'
}

interface Props {
  frames: StretchPose[]
  view: CameraView
  size?: number
  frameMs?: number
  playing?: boolean
}

export default function StretchAnimation({ frames, size = 150, frameMs = 700, playing = true }: Props) {
  const { einkMode } = useEinkMode()
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const isStatic = einkMode || reduced || !playing || frames.length < 2
  const [pose, setPose] = useState<StretchPose>(frames[isStatic ? frames.length - 1 : 0])
  const raf = useRef<number>(0)

  useEffect(() => {
    if (isStatic) { setPose(frames[frames.length - 1]); return }
    const t0 = performance.now()
    const period = Math.max(2400, frames.length * frameMs)
    const loop = (now: number) => {
      const phase = ((now - t0) % period) / period
      const tri = phase < 0.5 ? phase * 2 : (1 - phase) * 2
      const idx = ease(tri) * (frames.length - 1)
      const i = Math.floor(idx)
      const p = i >= frames.length - 1 ? frames[frames.length - 1] : lerpPose(frames[i], frames[i + 1], idx - i)
      setPose(p)
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
  }, [frames, isStatic, frameMs])

  const limbPts = (limb: LimbKey): Pt[] => {
    switch (limb) {
      case 'armL': return [pose.shoulderL, pose.elbowL, pose.handL]
      case 'armR': return [pose.shoulderR, pose.elbowR, pose.handR]
      case 'legL': return [pose.hip, pose.kneeL, pose.footL]
      case 'legR': return [pose.hip, pose.kneeR, pose.footR]
    }
  }
  const ptsStr = (pts: Pt[]) => pts.map(p => `${p[0]},${p[1]}`).join(' ')

  const near = einkMode ? 'var(--text)' : 'var(--text)'
  const far = einkMode ? 'var(--text)' : 'var(--text-muted)'
  const nearW = einkMode ? 3.6 : 3.0
  const farW = einkMode ? 2.4 : 2.0
  const allLimbs: LimbKey[] = ['armL', 'armR', 'legL', 'legR']
  const farLimbs = allLimbs.filter(l => depthOf(pose, l) === 'far')
  const nearLimbs = allLimbs.filter(l => depthOf(pose, l) === 'near')

  const limbLine = (limb: LimbKey, isFar: boolean) => (
    <polyline
      key={limb}
      points={ptsStr(limbPts(limb))}
      fill="none"
      stroke={isFar ? far : near}
      strokeWidth={isFar ? farW : nearW}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={isFar && !einkMode ? 0.55 : 1}
    />
  )

  const mid: Pt = [(pose.shoulderL[0] + pose.shoulderR[0]) / 2, (pose.shoulderL[1] + pose.shoulderR[1]) / 2]
  const torso = `${pose.shoulderL[0]},${pose.shoulderL[1]} ${pose.shoulderR[0]},${pose.shoulderR[1]} ${pose.hip[0] + 4},${pose.hip[1]} ${pose.hip[0] - 4},${pose.hip[1]}`
  const facePt: Pt = pose.facing === 'right'
    ? [pose.head[0] + 4.5, pose.head[1] + 1]
    : pose.facing === 'left'
      ? [pose.head[0] - 4.5, pose.head[1] + 1]
      : [pose.head[0], pose.head[1] + 3.5]

  return (
    <svg
      viewBox="0 0 100 120"
      width={size}
      height={size * 1.2}
      role="img"
      aria-label="Stretch demonstration"
      style={{ display: 'block' }}
    >
      <line x1="14" y1="115" x2="86" y2="115" stroke="var(--border)" strokeWidth="1" />
      {farLimbs.map(l => limbLine(l, true))}
      <polygon points={torso} fill="var(--surface)" stroke={near} strokeWidth={einkMode ? 2.8 : 2.4} strokeLinejoin="round" />
      <line x1={pose.neck[0]} y1={pose.neck[1]} x2={mid[0]} y2={mid[1]} stroke={near} strokeWidth={nearW} strokeLinecap="round" />
      <line x1={pose.neck[0]} y1={pose.neck[1]} x2={pose.head[0]} y2={pose.head[1] + 5} stroke={near} strokeWidth={nearW} strokeLinecap="round" />
      <circle cx={pose.head[0]} cy={pose.head[1]} r="6" fill="var(--surface)" stroke={near} strokeWidth={einkMode ? 2.8 : 2.4} />
      <circle cx={facePt[0]} cy={facePt[1]} r="1.5" fill={near} />
      {nearLimbs.map(l => limbLine(l, false))}
      <circle cx={pose.handL[0]} cy={pose.handL[1]} r="1.8" fill={depthOf(pose, 'armL') === 'far' ? far : near} />
      <circle cx={pose.handR[0]} cy={pose.handR[1]} r="1.8" fill={depthOf(pose, 'armR') === 'far' ? far : near} />
    </svg>
  )
}
