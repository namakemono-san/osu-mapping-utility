import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconHeadphones,
  IconMaximize,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerSkipBack,
  IconRefresh,
  IconZoomIn,
  IconZoomOut
} from '@tabler/icons-react'
import { BeatmapsetHeader } from '../components/beatmapset/BeatmapsetHeader'
import { DiffPills } from '../components/beatmapset/DiffPills'
import { useMetronome } from '../hooks/useMetronome'
import {
  analyzeAudio,
  analyzeAudioOffset,
  analyzeBpm,
  applyOffset,
  getTimingInfo,
  startAudioConnection,
  startConnection,
  type Beatmapset,
  type TimingInfo
} from '../utils/signalr'
import { jsonCodec, useLocalStorage } from '../utils/useLocalStorage'

function sanitizeBpm(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return 1
  return Math.min(bpm, 2000)
}

interface OffsetCalibratorProps {
  beatmapset: Beatmapset | null
}

const STEPS = [-10, -5, -2, -1, 1, 2, 5, 10] as const
const BEAT_COUNT = 5
const BEAT_BEFORE_MS = 100
const BEAT_AFTER_MS = 100

function AdjustButtons({
  value,
  onChange,
  min,
  max
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-1">
      {STEPS.map((step) => {
        const next = Math.min(max, Math.max(min, value + step))
        const disabled = next === value
        return (
          <button
            key={step}
            type="button"
            disabled={disabled}
            onClick={() => onChange(next)}
            className={`h-8 rounded-md border px-2 font-mono text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              step < 0
                ? 'border-red-500/30 bg-red-500/20 hover:bg-red-500/30'
                : 'border-green-500/30 bg-green-500/20 hover:bg-green-500/30'
            }`}
          >
            {step > 0 ? `+${step}` : step}
          </button>
        )
      })}
    </div>
  )
}

function getBeatWaveform(
  audioBuffer: AudioBuffer,
  beatStartMs: number,
  beforeMs = BEAT_BEFORE_MS,
  afterMs = BEAT_AFTER_MS
): Float32Array {
  const sr = audioBuffer.sampleRate
  const ch0 = audioBuffer.getChannelData(0)
  const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null

  const startMs = Math.max(0, beatStartMs - beforeMs)
  const endMs = Math.min(audioBuffer.duration * 1000, beatStartMs + afterMs)
  const startSample = Math.max(0, Math.floor((startMs / 1000) * sr))
  const endSample = Math.min(ch0.length, Math.ceil((endMs / 1000) * sr))
  const length = Math.max(0, endSample - startSample)

  const out = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const s0 = ch0[startSample + i] || 0
    out[i] = ch1 ? (s0 + (ch1[startSample + i] || 0)) * 0.5 : s0
  }
  return out
}

function segmentIndexAt(segments: { time: number; bpm: number }[], songMs: number): number {
  let idx = 0
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].time <= songMs) idx = i
    else break
  }
  return idx
}

function BeatWaveformList({
  audioBuffer,
  segments,
  isPlaying,
  getCurrentPlayheadMs,
  numBeats = BEAT_COUNT
}: {
  audioBuffer: AudioBuffer | null
  segments: { time: number; bpm: number }[]
  isPlaying: boolean
  getCurrentPlayheadMs: () => number
  numBeats?: number
}): React.JSX.Element {
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
    const current = isPlaying ? playheadMs : Math.max(0, segments[0].time)

    let segIdx = segmentIndexAt(segments, current)
    let seg = segments[segIdx]
    let beatMs = 60000 / Math.max(1, seg.bpm)
    const rel = current - seg.time
    let beatIndex = rel <= 0 ? 0 : Math.ceil(rel / beatMs)

    const rows: { beatIndex: number; beatStartMs: number; beatMs: number }[] = []
    let guard = 0
    while (rows.length < numBeats && guard < numBeats * 50) {
      guard++
      const songT = seg.time + beatIndex * beatMs
      const nextSeg = segments[segIdx + 1]
      if (nextSeg && songT >= nextSeg.time) {
        segIdx += 1
        seg = segments[segIdx]
        beatMs = 60000 / Math.max(1, seg.bpm)
        beatIndex = 0
        continue
      }
      rows.push({ beatIndex, beatStartMs: songT, beatMs })
      beatIndex += 1
    }
    return rows
  }, [segments, isPlaying, playheadMs, numBeats])

  useEffect(() => {
    for (let i = 0; i < beatRows.length; i++) {
      const row = beatRows[i]
      const canvas = canvasRefs.current[i]
      if (!canvas) continue

      const dpr = window.devicePixelRatio || 1
      const cssW = canvas.clientWidth || 220
      const cssH = canvas.clientHeight || 36
      canvas.width = Math.floor(cssW * dpr)
      canvas.height = Math.floor(cssH * dpr)

      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)

      const active = isPlaying
        ? playheadMs >= row.beatStartMs && playheadMs < row.beatStartMs + row.beatMs
        : row.beatIndex === 0

      ctx.fillStyle = active ? '#22c55e22' : '#18181b'
      ctx.fillRect(0, 0, cssW, cssH)

      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, cssH * 0.5 + 0.5)
      ctx.lineTo(cssW, cssH * 0.5 + 0.5)
      ctx.stroke()

      const centerX = cssW / 2
      ctx.strokeStyle = active ? '#ef4444' : '#71717a'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(centerX + 0.5, 0)
      ctx.lineTo(centerX + 0.5, cssH)
      ctx.stroke()

      if (!audioBuffer) continue

      const data = getBeatWaveform(audioBuffer, row.beatStartMs)
      if (data.length <= 1) continue

      const waveColor = active ? '#22c55e' : '#3cc4ff'

      let peak = 0
      for (let k = 0; k < data.length; k++) {
        const abs = Math.abs(data[k])
        if (abs > peak) peak = abs
      }
      const gain = peak > 0.001 ? Math.min(8, 0.9 / peak) : 1

      const step = Math.max(1, Math.floor(data.length / cssW))
      for (let x = 0; x < cssW; x++) {
        const from = x * step
        const to = Math.min(data.length, from + step)
        let min = 1
        let max = -1
        for (let k = from; k < to; k++) {
          const v = Math.max(-1, Math.min(1, data[k] * gain))
          if (v < min) min = v
          if (v > max) max = v
        }
        const y1 = cssH * 0.5 - max * (cssH * 0.42)
        const y2 = cssH * 0.5 - min * (cssH * 0.42)
        const h = Math.max(1.2, y2 - y1)
        ctx.fillStyle = waveColor
        ctx.fillRect(x, y1, 1, h)
      }
    }
  }, [audioBuffer, beatRows, isPlaying, playheadMs])

  return (
    <div className="flex h-full min-w-56 flex-col gap-1.5 overflow-hidden rounded-lg border border-border-subtle bg-surface-dark p-2">
      <div className="shrink-0 px-1 text-[10px] text-text-muted">Beat Waveforms</div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        {beatRows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-xs text-text-dim">—</div>
        ) : (
          beatRows.map((row, i) => {
            const beatInMeasure = (row.beatIndex % 4) + 1
            const active = isPlaying
              ? playheadMs >= row.beatStartMs && playheadMs < row.beatStartMs + row.beatMs
              : row.beatIndex === 0
            return (
              <div
                key={i}
                className={`flex shrink-0 items-center gap-2 rounded-md border px-2 py-1 ${
                  active ? 'border-green-500/40 bg-green-500/10' : 'border-border-subtle bg-surface'
                }`}
              >
                <div className="w-11 font-mono text-xs opacity-85">
                  {row.beatIndex + 1} ({beatInMeasure}/4)
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

function clampViewStart(v: number, dur: number, range: number): number {
  if (!dur) return 0
  const maxStart = Math.max(0, dur - range)
  return Math.min(Math.max(0, v), maxStart)
}

function WaveformCanvas({
  audioBuffer,
  getCurrentPlayheadMs,
  durationMs,
  segments,
  offsetMs,
  zoom,
  viewStartMs,
  isPlaying,
  onSeek,
  onWheel,
  onViewStartChange,
  onZoomAt
}: {
  audioBuffer: AudioBuffer | null
  getCurrentPlayheadMs: () => number
  durationMs: number
  segments: { time: number; bpm: number }[]
  offsetMs: number
  zoom: number
  viewStartMs: number
  isPlaying: boolean
  onSeek: (ms: number) => void
  onWheel: (e: React.WheelEvent) => void
  onViewStartChange: (ms: number) => void
  onZoomAt: (factor: number) => void
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const waveCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const dragging = useRef<{ startX: number; startView: number } | null>(null)
  const clickArmed = useRef(false)
  const followPlayheadRef = useRef(true)
  const wasPlayingRef = useRef(isPlaying)

  const audioBufferRef = useRef(audioBuffer)
  const durationMsRef = useRef(durationMs)
  const segmentsRef = useRef(segments)
  const offsetMsRef = useRef(offsetMs)
  const zoomRef = useRef(zoom)
  const viewStartMsRef = useRef(viewStartMs)
  const isPlayingRef = useRef(isPlaying)
  const getCurrentPlayheadMsRef = useRef(getCurrentPlayheadMs)

  useLayoutEffect(() => {
    audioBufferRef.current = audioBuffer
  }, [audioBuffer])
  useLayoutEffect(() => {
    durationMsRef.current = durationMs
  }, [durationMs])
  useLayoutEffect(() => {
    segmentsRef.current = segments
  }, [segments])
  useLayoutEffect(() => {
    offsetMsRef.current = offsetMs
  }, [offsetMs])
  useLayoutEffect(() => {
    zoomRef.current = zoom
  }, [zoom])
  useLayoutEffect(() => {
    viewStartMsRef.current = viewStartMs
  }, [viewStartMs])
  useLayoutEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])
  useLayoutEffect(() => {
    getCurrentPlayheadMsRef.current = getCurrentPlayheadMs
  }, [getCurrentPlayheadMs])

  const getViewRange = useCallback((): { vStart: number; vEnd: number } => {
    const dur = durationMsRef.current
    if (dur <= 0) return { vStart: 0, vEnd: 0 }
    const z = zoomRef.current
    const vRange = Math.max(200, dur / z)
    const headMs = getCurrentPlayheadMsRef.current()
    const playing = isPlayingRef.current

    const clampedStart = clampViewStart(viewStartMsRef.current, dur, vRange)
    const clampedEnd = Math.min(dur, clampedStart + vRange)

    let vStart: number
    if (playing && followPlayheadRef.current) {
      vStart = headMs - vRange / 2
    } else if (playing) {
      vStart = clampedStart
    } else {
      const headOutsideView = headMs < clampedStart || headMs > clampedEnd
      vStart = headOutsideView ? clampViewStart(headMs - vRange / 2, dur, vRange) : clampedStart
    }
    return { vStart, vEnd: Math.min(dur, vStart + vRange) }
  }, [])

  useEffect(() => {
    if (isPlaying && !wasPlayingRef.current) followPlayheadRef.current = true
    if (!isPlaying && wasPlayingRef.current) {
      onViewStartChange(getViewRange().vStart)
    }
    wasPlayingRef.current = isPlaying
  }, [isPlaying, getViewRange, onViewStartChange])

  const draw = useCallback(() => {
    const wc = waveCanvasRef.current
    const oc = overlayCanvasRef.current
    const container = containerRef.current
    if (!wc || !oc || !container) return

    const dpr = window.devicePixelRatio || 1
    const w = container.clientWidth
    const h = container.clientHeight
    if (w === 0 || h === 0) return

    for (const c of [wc, oc]) {
      c.width = Math.floor(w * dpr)
      c.height = Math.floor(h * dpr)
      c.style.width = `${w}px`
      c.style.height = `${h}px`
    }

    const wctx = wc.getContext('2d')!
    wctx.setTransform(1, 0, 0, 1, 0, 0)
    wctx.scale(dpr, dpr)
    const grad = wctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, '#141414')
    grad.addColorStop(1, '#1b1b1b')
    wctx.fillStyle = grad
    wctx.fillRect(0, 0, w, h)

    const buf = audioBufferRef.current
    const segmentsVal = segmentsRef.current
    const offVal = offsetMsRef.current
    const z = zoomRef.current
    const playing = isPlayingRef.current
    const headMs = getCurrentPlayheadMsRef.current()
    const { vStart, vEnd } = getViewRange()

    if (vEnd <= vStart) return

    if (buf) {
      const sr = buf.sampleRate
      const ch0 = buf.getChannelData(0)
      const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null
      const msToSample = (ms: number): number =>
        Math.max(0, Math.min(ch0.length - 1, Math.floor((ms / 1000) * sr)))
      const mid = Math.floor(h / 2)
      const samplesPerPixel = Math.max(1, Math.floor((msToSample(vEnd) - msToSample(vStart)) / w))
      const step = Math.max(1, Math.floor(samplesPerPixel / 50))
      wctx.fillStyle = '#3cc4ff22'
      for (let x = 0; x < w; x++) {
        const sA = msToSample(vStart + (x / w) * (vEnd - vStart))
        const sB = msToSample(vStart + ((x + 1) / w) * (vEnd - vStart))
        let maxVal = -Infinity
        let minVal = Infinity
        for (let s = sA; s <= sB; s += step) {
          let v = ch0[s]
          if (ch1) v = (v + ch1[s]) * 0.5
          if (v > maxVal) maxVal = v
          if (v < minVal) minVal = v
        }
        if (maxVal === -Infinity) continue
        const y1 = mid - maxVal * (h * 0.45)
        const y2 = mid - minVal * (h * 0.45)
        wctx.fillRect(x, y1, 1, Math.max(1, y2 - y1))
      }
    }

    const octx = oc.getContext('2d')!
    octx.setTransform(1, 0, 0, 1, 0, 0)
    octx.scale(dpr, dpr)
    octx.clearRect(0, 0, w, h)

    for (let si = 0; si < segmentsVal.length; si++) {
      const seg = segmentsVal[si]
      if (seg.bpm <= 0) continue
      const segEnd = si + 1 < segmentsVal.length ? segmentsVal[si + 1].time : Infinity
      const rangeEnd = Math.min(vEnd, segEnd)
      if (rangeEnd < vStart) continue
      const beatMs = 60000 / seg.bpm
      const rangeStart = Math.max(vStart, seg.time)
      const firstIdx = Math.ceil((rangeStart - seg.time) / beatMs)
      const maxLines = w * 2 + 16
      for (let idx = Math.max(0, firstIdx), drawn = 0; drawn < maxLines; idx++, drawn++) {
        const t = seg.time + idx * beatMs
        if (t > rangeEnd) break
        if (t < vStart) continue
        const x = ((t - vStart) / (vEnd - vStart)) * w + 0.5
        const isMeasureStart = idx % 4 === 0
        octx.strokeStyle = isMeasureStart ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.3)'
        octx.lineWidth = isMeasureStart ? 2 : 1
        octx.beginPath()
        octx.moveTo(x, 0)
        octx.lineTo(x, h)
        octx.stroke()
        if (isMeasureStart && z > 3) {
          const measureNum = Math.floor(idx / 4) + 1
          octx.fillStyle = 'rgba(239,68,68,0.8)'
          octx.font = '11px monospace'
          octx.fillText(`${measureNum}`, x + 4, 14)
        }
      }
    }

    if (offVal >= vStart && offVal <= vEnd) {
      const ox = ((offVal - vStart) / (vEnd - vStart)) * w + 0.5
      octx.strokeStyle = '#22c55e'
      octx.lineWidth = 2
      octx.beginPath()
      octx.moveTo(ox, 0)
      octx.lineTo(ox, h)
      octx.stroke()
      octx.fillStyle = '#22c55e'
      octx.font = '10px sans-serif'
      octx.fillText('Offset', ox + 4, h - 6)
    }

    if (headMs >= vStart && headMs <= vEnd) {
      const hx = ((headMs - vStart) / (vEnd - vStart)) * w + 0.5
      octx.strokeStyle = playing ? '#eab308' : 'rgba(234,179,8,0.7)'
      octx.lineWidth = playing ? 3 : 2
      octx.beginPath()
      octx.moveTo(hx, 0)
      octx.lineTo(hx, h)
      octx.stroke()
    }
  }, [getViewRange])

  useEffect(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    const tick = (): void => {
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [draw])

  const visibleRangeMs = durationMs > 0 ? Math.max(200, durationMs / zoom) : 0
  const maxStart = Math.max(0, durationMs - visibleRangeMs)

  const handleMouseDown = (e: React.MouseEvent): void => {
    dragging.current = { startX: e.clientX, startView: getViewRange().vStart }
    clickArmed.current = true
  }
  const handleMouseMove = (e: React.MouseEvent): void => {
    if (!dragging.current || !durationMs) return
    const dx = e.clientX - dragging.current.startX
    if (Math.abs(dx) <= 4) return
    clickArmed.current = false
    followPlayheadRef.current = false
    const panMs = -(dx / (containerRef.current?.clientWidth ?? 1)) * visibleRangeMs
    onViewStartChange(Math.max(0, Math.min(maxStart, dragging.current.startView + panMs)))
  }
  const handleMouseUp = (): void => {
    dragging.current = null
  }
  const handleClick = (e: React.MouseEvent): void => {
    if (!clickArmed.current || !durationMs) return
    const { vStart, vEnd } = getViewRange()
    const rect = e.currentTarget.getBoundingClientRect()
    const ms = vStart + ((e.clientX - rect.left) / rect.width) * (vEnd - vStart)
    followPlayheadRef.current = true
    onSeek(Math.max(0, Math.min(durationMs, ms)))
  }

  return (
    <div
      ref={containerRef}
      className="relative h-56 w-full cursor-crosshair select-none overflow-hidden rounded-lg border border-border-subtle"
      onWheel={onWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleClick}
      onDoubleClick={(e) => {
        e.preventDefault()
        onZoomAt(1.5)
      }}
    >
      {!audioBuffer && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-text-dim">
          {durationMs > 0 ? 'Loading waveform…' : 'No audio loaded'}
        </div>
      )}
      <canvas ref={waveCanvasRef} className="absolute inset-0" />
      <canvas ref={overlayCanvasRef} className="pointer-events-none absolute inset-0" />
    </div>
  )
}

export function OffsetCalibrator({ beatmapset }: OffsetCalibratorProps): React.JSX.Element {
  const [audioFilename, setAudioFilename] = useState<string | null>(null)
  const [timingInfos, setTimingInfos] = useState<TimingInfo[]>([])
  const [selectedVersion, setSelectedVersion] = useState('')
  const [selectedPointIndex, setSelectedPointIndex] = useState(0)

  const [bpm, setBpm] = useState(120)
  const [bpmCandidates, setBpmCandidates] = useState<number[]>([])
  const [offsetMs, setOffsetMs] = useState(0)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzingOffset, setAnalyzingOffset] = useState(false)
  const [ctrlBoost, setCtrlBoost] = useState(false)

  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null)

  const [playing, setPlaying] = useState(false)
  const [currentMs, setCurrentMs] = useState(0)
  const [playVol, setPlayVol] = useLocalStorage('calibrator:playVolume', 0.35, jsonCodec<number>())
  const [metroVol, setMetroVol] = useLocalStorage(
    'calibrator:metroVolume',
    0.25,
    jsonCodec<number>()
  )
  const [metroOn, setMetroOn] = useLocalStorage('calibrator:metroOn', true, jsonCodec<boolean>())

  const [zoom, setZoom] = useState(1)
  const [viewStartMs, setViewStartMs] = useState(0)
  const [applyToAll, setApplyToAll] = useState(true)
  const [busy, setBusy] = useState(false)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const srcNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const mountedRef = useRef(true)
  const playFromRef = useRef<(ms: number) => void>(() => {})
  const playStartAtRef = useRef(0)
  const playStartCtxTimeRef = useRef(0)
  const cursorMsRef = useRef(0)
  const isPlayingRef = useRef(false)
  const durationMsRef = useRef(0)

  const durationMs = audioBuffer ? audioBuffer.duration * 1000 : 0

  useEffect(() => {
    durationMsRef.current = durationMs
  }, [durationMs])

  const audioUrl =
    beatmapset && audioFilename
      ? `asset:///${beatmapset.folderPath.replace(/\\/g, '/')}/${audioFilename}`
      : undefined
  const visibleRangeMs = durationMs > 0 ? Math.max(200, durationMs / zoom) : 0
  const currentTiming = timingInfos.find((t) => t.version === selectedVersion) ?? timingInfos[0]
  const currentPoint = currentTiming?.points[selectedPointIndex] ?? currentTiming?.points[0]
  const deltaMs = currentPoint != null ? offsetMs - Math.round(currentPoint.time) : null

  const selectSection = useCallback(
    (i: number): void => {
      const p = currentTiming?.points[i]
      if (!p) return
      setSelectedPointIndex(i)
      setBpm(Math.round(p.bpm))
      setOffsetMs(Math.round(p.time))
    },
    [currentTiming]
  )
  const effectiveBpm = ctrlBoost ? bpm * 2 : bpm
  const segments = useMemo(
    () =>
      currentTiming?.points.map((p, i) => ({
        time: p.time + (deltaMs ?? 0),
        bpm: sanitizeBpm(i === selectedPointIndex ? effectiveBpm : p.bpm)
      })) ?? [],
    [currentTiming, selectedPointIndex, effectiveBpm, deltaMs]
  )

  const ensureAudioCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
    return audioCtxRef.current
  }, [])

  const getCurrentPlayheadMs = useCallback((): number => {
    const ctx = audioCtxRef.current
    if (!isPlayingRef.current || !ctx) return cursorMsRef.current
    const elapsed = (ctx.currentTime - playStartCtxTimeRef.current) * 1000
    return Math.min(durationMsRef.current, playStartAtRef.current + elapsed)
  }, [])

  const songMsToCtxTime = useCallback((songMs: number): number => {
    return playStartCtxTimeRef.current + (songMs - playStartAtRef.current) / 1000
  }, [])

  useMetronome({
    segments,
    metroOn,
    metroVol,
    isPlaying: playing,
    getCurrentPlayheadMs,
    songMsToCtxTime,
    ensureAudioCtx
  })

  const lastAutoSectionRef = useRef(-1)
  useEffect(() => {
    if (!playing || !currentTiming) return
    let raf = 0
    const tick = (): void => {
      const nowSong = getCurrentPlayheadMs()
      const points = currentTiming.points
      let idx = 0
      for (let i = 0; i < points.length; i++) {
        if (points[i].time <= nowSong) idx = i
        else break
      }
      if (idx !== lastAutoSectionRef.current) {
        lastAutoSectionRef.current = idx
        selectSection(idx)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, currentTiming, getCurrentPlayheadMs, selectSection])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Control') setCtrlBoost(true)
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === 'Control') setCtrlBoost(false)
    }
    const onBlur = (): void => setCtrlBoost(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  const stopPlayback = useCallback((reset = false) => {
    let nextCursor = cursorMsRef.current
    const ctx = audioCtxRef.current
    if (!reset && isPlayingRef.current && ctx) {
      const elapsed = (ctx.currentTime - playStartCtxTimeRef.current) * 1000
      nextCursor = Math.min(durationMsRef.current, Math.max(0, playStartAtRef.current + elapsed))
    }

    if (srcNodeRef.current) {
      srcNodeRef.current.onended = null
      try {
        srcNodeRef.current.stop()
        // eslint-disable-next-line no-empty
      } catch {}
      srcNodeRef.current.disconnect()
      srcNodeRef.current = null
    }

    setPlaying(false)
    isPlayingRef.current = false
    playStartAtRef.current = 0
    playStartCtxTimeRef.current = 0
    cursorMsRef.current = reset ? 0 : nextCursor
    setCurrentMs(reset ? 0 : nextCursor)
  }, [])

  const playFrom = useCallback(
    async (ms: number) => {
      const buf = audioBuffer
      if (!buf) return
      const ctx = ensureAudioCtx()
      await ctx.resume()
      stopPlayback()

      const src = ctx.createBufferSource()
      const g = ctx.createGain()
      src.buffer = buf
      src.connect(g)
      g.connect(ctx.destination)
      g.gain.value = playVol

      src.start(0, Math.max(0, ms / 1000))
      src.onended = () => {
        if (!mountedRef.current) return
        setPlaying(false)
        isPlayingRef.current = false
        playStartAtRef.current = 0
        playStartCtxTimeRef.current = 0
        cursorMsRef.current = durationMsRef.current
        setCurrentMs(durationMsRef.current)
      }

      srcNodeRef.current = src
      gainRef.current = g

      setPlaying(true)
      isPlayingRef.current = true
      playStartAtRef.current = ms
      playStartCtxTimeRef.current = ctx.currentTime
      cursorMsRef.current = ms
      setCurrentMs(ms)
    },
    [audioBuffer, ensureAudioCtx, stopPlayback, playVol]
  )

  useEffect(() => {
    playFromRef.current = (ms: number) => {
      void playFrom(ms)
    }
  }, [playFrom])

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = playVol
  }, [playVol])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (srcNodeRef.current) {
        srcNodeRef.current.onended = null
        try {
          srcNodeRef.current.stop()
          // eslint-disable-next-line no-empty
        } catch {}
        srcNodeRef.current.disconnect()
        srcNodeRef.current = null
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {})
        audioCtxRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = (): void => {
      setCurrentMs(getCurrentPlayheadMs())
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, getCurrentPlayheadMs])

  useEffect(() => {
    if (!beatmapset) {
      setAudioFilename(null)
      setTimingInfos([])
      setBpmCandidates([])
      setBpm(120)
      setOffsetMs(0)
      setAudioBuffer(null)
      stopPlayback(true)
      return
    }
    setAudioFilename(null)
    setAudioBuffer(null)
    setBpmCandidates([])
    setSelectedVersion(beatmapset.difficulties[0]?.version ?? '')
    stopPlayback(true)
    setZoom(100)
    setViewStartMs(0)

    let cancelled = false

    void startConnection().then((ok) => {
      if (cancelled || !ok) return
      void getTimingInfo(beatmapset.folderPath)
        .then((infos) => {
          if (cancelled) return
          setTimingInfos(infos)
        })
        .catch(() => {})
    })

    void startAudioConnection().then((ok) => {
      if (cancelled || !ok) return
      void analyzeAudio(beatmapset.folderPath)
        .then((groups) => {
          if (cancelled) return
          setAudioFilename(groups[0]?.audioFilename ?? null)
        })
        .catch(() => {})
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatmapset?.folderPath])

  const prevVersionRef = useRef<string | null>(null)
  useEffect(() => {
    if (!currentTiming) return
    const versionChanged = prevVersionRef.current !== selectedVersion
    prevVersionRef.current = selectedVersion
    const idx = versionChanged ? 0 : Math.min(selectedPointIndex, currentTiming.points.length - 1)
    if (versionChanged) setSelectedPointIndex(idx)
    const p = currentTiming.points[idx]
    if (p) {
      setBpm(Math.round(p.bpm))
      setOffsetMs(Math.round(p.time))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVersion, timingInfos])

  useEffect(() => {
    if (!audioUrl) {
      setAudioBuffer(null)
      return
    }
    let cancelled = false
    stopPlayback(true)
    const ctx = ensureAudioCtx()
    fetch(audioUrl)
      .then((r) => r.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        if (!cancelled) setAudioBuffer(decoded)
      })
      .catch((e: unknown) => {
        console.error('Failed to decode audio for waveform display:', e)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl])

  const togglePlay = (): void => {
    if (playing) {
      stopPlayback()
      return
    }
    const atEnd = durationMs > 0 && cursorMsRef.current >= durationMs - 10
    playFromRef.current(atEnd ? 0 : cursorMsRef.current)
  }

  const playFromStart = (): void => {
    playFromRef.current(0)
  }

  const zoomAt = (factor: number): void => {
    if (!durationMs) return
    const next = Math.max(1, Math.min(128, zoom * factor))
    if (next === zoom) return
    const rangeNext = durationMs / next
    const anchor = getCurrentPlayheadMs()
    setZoom(next)
    setViewStartMs(clampViewStart(anchor - rangeNext / 2, durationMs, rangeNext))
  }

  const handleSeek = (ms: number): void => {
    const next = Math.max(0, Math.min(durationMsRef.current, ms))
    if (isPlayingRef.current) {
      playFromRef.current(next)
      return
    }
    cursorMsRef.current = next
    setCurrentMs(next)
    setViewStartMs(Math.max(0, next - visibleRangeMs / 2))
  }

  const handleWheel = (e: React.WheelEvent): void => {
    e.preventDefault()
    if (e.ctrlKey || e.shiftKey || e.metaKey) {
      zoomAt(Math.exp(-e.deltaY * 0.0015))
    } else {
      const pan = e.deltaY * (visibleRangeMs / 600)
      const max = Math.max(0, durationMs - visibleRangeMs)
      setViewStartMs((v) => Math.max(0, Math.min(max, v + pan)))
    }
  }

  const handleAnalyzeBpm = async (): Promise<void> => {
    if (!beatmapset || !audioFilename) return
    setAnalyzing(true)
    try {
      const result = await analyzeBpm(beatmapset.folderPath, audioFilename)
      setBpm(result.bpm)
      setBpmCandidates(result.candidates)
      setOffsetMs(result.offsetMs)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Analysis failed.')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleAnalyzeOffset = async (): Promise<void> => {
    if (!beatmapset || !audioFilename) return
    setAnalyzingOffset(true)
    try {
      const ms = await analyzeAudioOffset(beatmapset.folderPath, audioFilename, bpm)
      setOffsetMs(ms)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Analysis failed.')
    } finally {
      setAnalyzingOffset(false)
    }
  }

  const handleApply = async (): Promise<void> => {
    if (!beatmapset || !currentTiming || deltaMs == null || Number.isNaN(deltaMs) || deltaMs === 0)
      return
    const versions = applyToAll
      ? beatmapset.difficulties.map((d) => d.version)
      : selectedVersion
        ? [selectedVersion]
        : []
    if (versions.length === 0) return
    setBusy(true)
    try {
      await applyOffset(beatmapset.folderPath, versions, deltaMs)
      const updated = await getTimingInfo(beatmapset.folderPath)
      setTimingInfos(updated)
      toast.success(`Offset shifted by ${deltaMs >= 0 ? '+' : ''}${deltaMs} ms`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to apply.')
    } finally {
      setBusy(false)
    }
  }

  const formatTime = (ms: number): string => {
    const sign = ms < 0 ? '-' : ''
    const s = Math.floor(Math.abs(ms) / 1000)
    return `${sign}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  if (!beatmapset) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-text-muted">
          <IconHeadphones size={36} stroke={1} className="opacity-30" />
          <p className="text-sm">Select a beatmapset</p>
        </div>
      </div>
    )
  }

  const BTN =
    'h-8 inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm bg-surface-raised text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const CHIP =
    'h-8 inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border-subtle bg-surface-dark px-2.5 text-sm'
  const INPUT =
    'h-8 rounded-md border border-border-subtle bg-surface-dark px-2 text-sm leading-tight outline-none focus:border-primary'
  const PANEL = 'rounded-lg border border-border-subtle bg-surface-dark'

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <BeatmapsetHeader beatmapset={beatmapset}>
        <DiffPills
          diffs={beatmapset.difficulties}
          activeVersion={selectedVersion}
          onSelect={setSelectedVersion}
          variant="overlay"
        />
      </BeatmapsetHeader>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3 text-text-primary">
        <div className={`flex flex-wrap items-center gap-2 ${PANEL} p-2`}>
          <div className={`${CHIP} max-w-xs min-w-0 shrink`} title={audioFilename ?? 'No audio'}>
            <span className="truncate text-text-muted">{audioFilename ?? 'No audio'}</span>
          </div>
          <button onClick={playFromStart} disabled={!audioBuffer} className={BTN}>
            <IconPlayerSkipBack size={14} stroke={1.5} />
          </button>
          <button onClick={togglePlay} disabled={!audioBuffer} className={BTN}>
            {playing ? (
              <IconPlayerPause size={14} stroke={1.5} />
            ) : (
              <IconPlayerPlay size={14} stroke={1.5} />
            )}
            {playing ? 'Pause' : 'Play'}
          </button>
          <span className="font-mono text-xs tabular-nums text-text-muted">
            {formatTime(currentMs)} / {formatTime(durationMs)}
          </span>
          <div className="mx-1 h-4 w-px bg-border-subtle" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-muted">Vol</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={playVol}
              onChange={(e) => setPlayVol(Number(e.target.value))}
              className="w-24 accent-primary"
            />
          </div>
          <div className="mx-1 h-4 w-px bg-border-subtle" />
          <button
            onClick={() => setMetroOn((v) => !v)}
            className={`${BTN} ${metroOn ? 'bg-primary/20 text-primary ring-1 ring-primary/30' : ''}`}
          >
            Metro: {metroOn ? 'ON' : 'OFF'}
          </button>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-muted">Metro Vol</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={metroVol}
              onChange={(e) => setMetroVol(Number(e.target.value))}
              className="w-24 accent-primary"
            />
          </div>
        </div>

        <div className={`flex flex-col gap-2 ${PANEL} p-2`}>
          <div className="flex flex-wrap items-center gap-2">
            <div className={`${CHIP} min-w-40`}>
              <span className="w-14 text-center text-xs text-text-muted">BPM</span>
              <input
                type="number"
                min={1}
                value={bpm}
                onChange={(e) => setBpm(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
                className={`${INPUT} w-24`}
              />
              <span className="invisible text-xs text-text-muted">ms</span>
            </div>
            {ctrlBoost && (
              <div className={CHIP}>
                <span className="text-xs text-text-muted">×2</span>
                <span className="font-mono">{effectiveBpm}</span>
              </div>
            )}
            <AdjustButtons
              value={bpm}
              min={1}
              max={400}
              onChange={(v) => setBpm(Math.max(1, Math.floor(v)))}
            />
            <button
              disabled={!audioFilename || analyzing}
              onClick={() => void handleAnalyzeBpm()}
              className={`${BTN} min-w-36 justify-center`}
            >
              <IconRefresh size={14} stroke={1.5} className={analyzing ? 'animate-spin' : ''} />
              Analyze BPM
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className={`${CHIP} min-w-40`}>
              <span className="w-14 text-center text-xs text-text-muted">Offset</span>
              <input
                type="number"
                value={offsetMs}
                onChange={(e) =>
                  setOffsetMs(
                    Math.max(0, Math.min(Math.round(durationMs), Number(e.target.value) || 0))
                  )
                }
                className={`${INPUT} w-24`}
              />
              <span className="text-xs text-text-muted">ms</span>
            </div>
            <AdjustButtons
              value={offsetMs}
              min={0}
              max={Math.max(0, Math.round(durationMs))}
              onChange={(v) =>
                setOffsetMs(Math.max(0, Math.min(Math.round(durationMs), Math.round(v))))
              }
            />
            <button
              disabled={!audioFilename || analyzingOffset}
              onClick={() => void handleAnalyzeOffset()}
              className={`${BTN} min-w-36 justify-center`}
            >
              <IconRefresh
                size={14}
                stroke={1.5}
                className={analyzingOffset ? 'animate-spin' : ''}
              />
              Analyze Offset
            </button>

            {currentTiming && deltaMs != null && deltaMs !== 0 && (
              <>
                <span className={`text-xs ${deltaMs > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {deltaMs > 0 ? '+' : ''}
                  {deltaMs} ms from current
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setApplyToAll(true)}
                    className={`rounded px-2 py-1 text-xs transition-colors ${applyToAll ? 'bg-primary/20 text-primary' : 'text-text-dim hover:text-text-secondary'}`}
                  >
                    All diffs
                  </button>
                  <button
                    onClick={() => setApplyToAll(false)}
                    className={`rounded px-2 py-1 text-xs transition-colors ${!applyToAll ? 'bg-primary/20 text-primary' : 'text-text-dim hover:text-text-secondary'}`}
                  >
                    {selectedVersion}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void handleApply()}
                    className="rounded bg-primary px-3 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
                  >
                    Apply
                  </button>
                </div>
              </>
            )}
          </div>

          {currentTiming && currentTiming.points.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">Section</span>
              <button
                onClick={() => selectSection(selectedPointIndex - 1)}
                disabled={selectedPointIndex <= 0}
                className={`${BTN} px-2`}
              >
                <IconChevronLeft size={14} stroke={1.5} />
              </button>
              <div className="relative">
                <select
                  value={selectedPointIndex}
                  onChange={(e) => selectSection(Number(e.target.value))}
                  className={`${INPUT} min-w-56 cursor-pointer appearance-none pr-7`}
                >
                  {currentTiming.points.map((p, i) => (
                    <option key={i} value={i}>
                      {i + 1}/{currentTiming.points.length}: {Math.round(p.bpm)} BPM @{' '}
                      {formatTime(p.time)}
                    </option>
                  ))}
                </select>
                <IconChevronDown
                  size={12}
                  stroke={2}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-dim"
                />
              </div>
              <button
                onClick={() => selectSection(selectedPointIndex + 1)}
                disabled={selectedPointIndex >= currentTiming.points.length - 1}
                className={`${BTN} px-2`}
              >
                <IconChevronRight size={14} stroke={1.5} />
              </button>
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <WaveformCanvas
              audioBuffer={audioBuffer}
              getCurrentPlayheadMs={getCurrentPlayheadMs}
              durationMs={durationMs}
              segments={segments}
              offsetMs={offsetMs}
              zoom={zoom}
              viewStartMs={viewStartMs}
              isPlaying={playing}
              onSeek={handleSeek}
              onWheel={handleWheel}
              onViewStartChange={setViewStartMs}
              onZoomAt={zoomAt}
            />

            <div className={`flex items-center gap-2 ${PANEL} p-2`}>
              <button onClick={() => zoomAt(1 / 1.2)} className={BTN}>
                <IconZoomOut size={14} stroke={1.5} /> Zoom Out
              </button>
              <button onClick={() => zoomAt(1.2)} className={BTN}>
                <IconZoomIn size={14} stroke={1.5} /> Zoom In
              </button>
              <button
                onClick={() => {
                  setZoom(1)
                  setViewStartMs(0)
                }}
                className={BTN}
              >
                <IconMaximize size={14} stroke={1.5} /> Fit
              </button>
              <div className="ml-auto text-xs text-text-muted">
                {zoom.toFixed(2)}×<span className="mx-2">·</span>
                {Math.round(viewStartMs)}–
                {Math.round(Math.min(durationMs, viewStartMs + visibleRangeMs))} ms
              </div>
            </div>

            <div className={`flex min-h-12 flex-wrap items-center gap-2 ${PANEL} p-2`}>
              <span className="text-xs text-text-muted">BPM candidates</span>
              {bpmCandidates.length > 0 ? (
                bpmCandidates.map((b) => (
                  <button
                    key={b}
                    onClick={() => setBpm(b)}
                    className={`h-8 rounded-md px-2 text-sm transition-colors ${
                      b === bpm
                        ? 'bg-primary text-white'
                        : 'bg-surface-raised text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                    }`}
                  >
                    {b}
                  </button>
                ))
              ) : (
                <span className="select-none text-xs italic text-text-dim">
                  Run &quot;Analyze BPM&quot; to see candidates
                </span>
              )}
            </div>
          </div>

          <div className="min-h-0 w-full xl:w-64">
            <BeatWaveformList
              audioBuffer={audioBuffer}
              segments={segments}
              isPlaying={playing}
              getCurrentPlayheadMs={getCurrentPlayheadMs}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
