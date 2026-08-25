export type TimingSegment = {
  time: number
  bpm: number
}

export const MAX_BPM = 2000

export function sanitizeBpm(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return 1
  return Math.min(bpm, MAX_BPM)
}

export function beatLengthMs(bpm: number): number {
  return 60000 / Math.max(1, bpm)
}

export function segmentIndexAt(segments: readonly TimingSegment[], songMs: number): number {
  let index = 0
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].time <= songMs) index = i
    else break
  }
  return index
}

export function clampViewStart(value: number, durationMs: number, rangeMs: number): number {
  if (!durationMs) return 0
  const maxStart = Math.max(0, durationMs - rangeMs)
  return Math.min(Math.max(0, value), maxStart)
}

export function formatTime(ms: number): string {
  const sign = ms < 0 ? '-' : ''
  const seconds = Math.floor(Math.abs(ms) / 1000)
  return `${sign}${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
