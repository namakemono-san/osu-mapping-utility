import { useEffect, useMemo, useRef, useState } from 'react'
import { beatLengthMs, segmentIndexAt, type TimingSegment } from '../../utils/timing'

const BEAT_COUNT = 5
const BEAT_BEFORE_MS = 100
const BEAT_AFTER_MS = 100
const METER_BEATS = 4

type BeatRow = {
  beatIndex: number
  beatStartMs: number
  beatMs: number
}

function getBeatWaveform(
  audioBuffer: AudioBuffer,
  beatStartMs: number,
  beforeMs = BEAT_BEFORE_MS,
  afterMs = BEAT_AFTER_MS
): Float32Array {
  const sampleRate = audioBuffer.sampleRate
  const left = audioBuffer.getChannelData(0)
  const right = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null

  const startMs = Math.max(0, beatStartMs - beforeMs)
  const endMs = Math.min(audioBuffer.duration * 1000, beatStartMs + afterMs)
  const startSample = Math.max(0, Math.floor((startMs / 1000) * sampleRate))
  const endSample = Math.min(left.length, Math.ceil((endMs / 1000) * sampleRate))
  const length = Math.max(0, endSample - startSample)

  const out = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const sample = left[startSample + i] || 0
    out[i] = right ? (sample + (right[startSample + i] || 0)) * 0.5 : sample
  }
  return out
}

function buildBeatRows(segments: TimingSegment[], startMs: number, numBeats: number): BeatRow[] {
  if (segments.length === 0) return []

  let segIndex = segmentIndexAt(segments, startMs)
  let segment = segments[segIndex]
  let beatMs = beatLengthMs(segment.bpm)
  const relative = startMs - segment.time
  let beatIndex = relative <= 0 ? 0 : Math.ceil(relative / beatMs)

  const rows: BeatRow[] = []
  for (let guard = 0; rows.length < numBeats && guard < numBeats * 50; guard++) {
    const songMs = segment.time + beatIndex * beatMs
    const nextSegment = segments[segIndex + 1]
    if (nextSegment && songMs >= nextSegment.time) {
      segIndex += 1
      segment = segments[segIndex]
      beatMs = beatLengthMs(segment.bpm)
      beatIndex = 0
      continue
    }
    rows.push({ beatIndex, beatStartMs: songMs, beatMs })
    beatIndex += 1
  }
  return rows
}

function isRowActive(row: BeatRow, isPlaying: boolean, playheadMs: number): boolean {
  return isPlaying
    ? playheadMs >= row.beatStartMs && playheadMs < row.beatStartMs + row.beatMs
    : row.beatIndex === 0
}

function drawBeatRow(
  canvas: HTMLCanvasElement,
  row: BeatRow,
  audioBuffer: AudioBuffer | null,
  active: boolean
): void {
  const dpr = window.devicePixelRatio || 1
  const width = canvas.clientWidth || 220
  const height = canvas.clientHeight || 36
  canvas.width = Math.floor(width * dpr)
  canvas.height = Math.floor(height * dpr)

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.scale(dpr, dpr)

  ctx.fillStyle = active ? '#22c55e22' : '#18181b'
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, height * 0.5 + 0.5)
  ctx.lineTo(width, height * 0.5 + 0.5)
  ctx.stroke()

  const centerX = width / 2
  ctx.strokeStyle = active ? '#ef4444' : '#71717a'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(centerX + 0.5, 0)
  ctx.lineTo(centerX + 0.5, height)
  ctx.stroke()

  if (!audioBuffer) return

  const data = getBeatWaveform(audioBuffer, row.beatStartMs)
  if (data.length <= 1) return

  let peak = 0
  for (let i = 0; i < data.length; i++) {
    const abs = Math.abs(data[i])
    if (abs > peak) peak = abs
  }
  const gain = peak > 0.001 ? Math.min(8, 0.9 / peak) : 1

  ctx.fillStyle = active ? '#22c55e' : '#3cc4ff'
  const step = Math.max(1, Math.floor(data.length / width))
  for (let x = 0; x < width; x++) {
    const from = x * step
    const to = Math.min(data.length, from + step)
    let min = 1
    let max = -1
    for (let i = from; i < to; i++) {
      const value = Math.max(-1, Math.min(1, data[i] * gain))
      if (value < min) min = value
      if (value > max) max = value
    }
    const y1 = height * 0.5 - max * (height * 0.42)
    const y2 = height * 0.5 - min * (height * 0.42)
    ctx.fillRect(x, y1, 1, Math.max(1.2, y2 - y1))
  }
}

type BeatWaveformListProps = {
  audioBuffer: AudioBuffer | null
  segments: TimingSegment[]
  isPlaying: boolean
  getCurrentPlayheadMs: () => number
  numBeats?: number
}

export function BeatWaveformList({
  audioBuffer,
  segments,
  isPlaying,
  getCurrentPlayheadMs,
  numBeats = BEAT_COUNT
}: BeatWaveformListProps): React.JSX.Element {
  const [playheadMs, setPlayheadMs] = useState(0)
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])

  useEffect(() => {
    if (!isPlaying) return
    let raf = 0
    const tick = (): void => {
      setPlayheadMs(getCurrentPlayheadMs())
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying, getCurrentPlayheadMs])

  const beatRows = useMemo(() => {
    if (segments.length === 0) return []
    const startMs = isPlaying ? playheadMs : Math.max(0, segments[0].time)
    return buildBeatRows(segments, startMs, numBeats)
  }, [segments, isPlaying, playheadMs, numBeats])

  useEffect(() => {
    canvasRefs.current.length = beatRows.length
    beatRows.forEach((row, i) => {
      const canvas = canvasRefs.current[i]
      if (canvas) drawBeatRow(canvas, row, audioBuffer, isRowActive(row, isPlaying, playheadMs))
    })
  }, [audioBuffer, beatRows, isPlaying, playheadMs])

  return (
    <div className="flex h-full min-w-56 flex-col gap-1.5 overflow-hidden rounded-lg border border-border-subtle bg-surface-dark p-2">
      <div className="shrink-0 px-1 text-[10px] text-text-muted">Beat Waveforms</div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        {beatRows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-xs text-text-dim">—</div>
        ) : (
          beatRows.map((row, i) => {
            const active = isRowActive(row, isPlaying, playheadMs)
            return (
              <div
                key={i}
                className={`flex shrink-0 items-center gap-2 rounded-md border px-2 py-1 ${
                  active ? 'border-green-500/40 bg-green-500/10' : 'border-border-subtle bg-surface'
                }`}
              >
                <div className="w-11 font-mono text-xs opacity-85">
                  {row.beatIndex + 1} ({(row.beatIndex % METER_BEATS) + 1}/{METER_BEATS})
                </div>
                <canvas
                  ref={(el) => {
                    canvasRefs.current[i] = el
                  }}
                  className="h-9 w-full rounded-sm"
                />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
