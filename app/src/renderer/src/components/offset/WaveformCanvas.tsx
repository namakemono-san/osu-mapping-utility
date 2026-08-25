import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { clampViewStart, type TimingSegment } from '../../utils/timing'

const MIN_VIEW_RANGE_MS = 200
const DRAG_THRESHOLD_PX = 4
const MEASURE_BEATS = 4

type WaveformCanvasProps = {
  audioBuffer: AudioBuffer | null
  getCurrentPlayheadMs: () => number
  playheadMs: number
  durationMs: number
  segments: TimingSegment[]
  offsetMs: number
  zoom: number
  viewStartMs: number
  isPlaying: boolean
  onSeek: (ms: number) => void
  onWheel: (e: React.WheelEvent) => void
  onViewStartChange: (ms: number) => void
  onZoomAt: (factor: number) => void
}

export function WaveformCanvas({
  audioBuffer,
  getCurrentPlayheadMs,
  playheadMs,
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
}: WaveformCanvasProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const waveCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
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
    durationMsRef.current = durationMs
    segmentsRef.current = segments
    offsetMsRef.current = offsetMs
    zoomRef.current = zoom
    viewStartMsRef.current = viewStartMs
    isPlayingRef.current = isPlaying
    getCurrentPlayheadMsRef.current = getCurrentPlayheadMs
  })

  const getViewRange = useCallback((): { vStart: number; vEnd: number } => {
    const duration = durationMsRef.current
    if (duration <= 0) return { vStart: 0, vEnd: 0 }

    const range = Math.max(MIN_VIEW_RANGE_MS, duration / zoomRef.current)
    const head = getCurrentPlayheadMsRef.current()
    const playing = isPlayingRef.current

    const clampedStart = clampViewStart(viewStartMsRef.current, duration, range)
    const clampedEnd = Math.min(duration, clampedStart + range)

    let vStart: number
    if (playing && followPlayheadRef.current) {
      vStart = head - range / 2
    } else if (playing) {
      vStart = clampedStart
    } else {
      const headOutsideView = head < clampedStart || head > clampedEnd
      vStart = headOutsideView ? clampViewStart(head - range / 2, duration, range) : clampedStart
    }
    return { vStart, vEnd: Math.min(duration, vStart + range) }
  }, [])

  useEffect(() => {
    if (isPlaying && !wasPlayingRef.current) followPlayheadRef.current = true
    if (!isPlaying && wasPlayingRef.current) onViewStartChange(getViewRange().vStart)
    wasPlayingRef.current = isPlaying
  }, [isPlaying, getViewRange, onViewStartChange])

  const draw = useCallback(() => {
    const waveCanvas = waveCanvasRef.current
    const overlayCanvas = overlayCanvasRef.current
    const container = containerRef.current
    if (!waveCanvas || !overlayCanvas || !container) return

    const dpr = window.devicePixelRatio || 1
    const width = container.clientWidth
    const height = container.clientHeight
    if (width === 0 || height === 0) return

    for (const canvas of [waveCanvas, overlayCanvas]) {
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }

    const wctx = waveCanvas.getContext('2d')
    const octx = overlayCanvas.getContext('2d')
    if (!wctx || !octx) return

    wctx.setTransform(1, 0, 0, 1, 0, 0)
    wctx.scale(dpr, dpr)
    const gradient = wctx.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, '#141414')
    gradient.addColorStop(1, '#1b1b1b')
    wctx.fillStyle = gradient
    wctx.fillRect(0, 0, width, height)

    const buffer = audioBufferRef.current
    const segmentList = segmentsRef.current
    const offset = offsetMsRef.current
    const zoomLevel = zoomRef.current
    const playing = isPlayingRef.current
    const head = getCurrentPlayheadMsRef.current()
    const { vStart, vEnd } = getViewRange()

    if (vEnd <= vStart) return

    if (buffer) {
      const sampleRate = buffer.sampleRate
      const left = buffer.getChannelData(0)
      const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null
      const msToSample = (ms: number): number =>
        Math.max(0, Math.min(left.length - 1, Math.floor((ms / 1000) * sampleRate)))
      const mid = Math.floor(height / 2)
      const samplesPerPixel = Math.max(
        1,
        Math.floor((msToSample(vEnd) - msToSample(vStart)) / width)
      )
      const step = Math.max(1, Math.floor(samplesPerPixel / 50))
      wctx.fillStyle = '#3cc4ff22'
      for (let x = 0; x < width; x++) {
        const from = msToSample(vStart + (x / width) * (vEnd - vStart))
        const to = msToSample(vStart + ((x + 1) / width) * (vEnd - vStart))
        let maxValue = -Infinity
        let minValue = Infinity
        for (let s = from; s <= to; s += step) {
          const value = right ? (left[s] + right[s]) * 0.5 : left[s]
          if (value > maxValue) maxValue = value
          if (value < minValue) minValue = value
        }
        if (maxValue === -Infinity) continue
        const y1 = mid - maxValue * (height * 0.45)
        const y2 = mid - minValue * (height * 0.45)
        wctx.fillRect(x, y1, 1, Math.max(1, y2 - y1))
      }
    }

    octx.setTransform(1, 0, 0, 1, 0, 0)
    octx.scale(dpr, dpr)
    octx.clearRect(0, 0, width, height)

    const toX = (ms: number): number => ((ms - vStart) / (vEnd - vStart)) * width + 0.5

    for (let si = 0; si < segmentList.length; si++) {
      const segment = segmentList[si]
      if (segment.bpm <= 0) continue
      const segmentEnd = si + 1 < segmentList.length ? segmentList[si + 1].time : Infinity
      const rangeEnd = Math.min(vEnd, segmentEnd)
      if (rangeEnd < vStart) continue

      const beatMs = 60000 / segment.bpm
      const rangeStart = Math.max(vStart, segment.time)
      const firstIndex = Math.ceil((rangeStart - segment.time) / beatMs)
      const maxLines = width * 2 + 16

      for (let index = Math.max(0, firstIndex), drawn = 0; drawn < maxLines; index++, drawn++) {
        const time = segment.time + index * beatMs
        if (time > rangeEnd) break
        if (time < vStart) continue
        const x = toX(time)
        const isMeasureStart = index % MEASURE_BEATS === 0
        octx.strokeStyle = isMeasureStart ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.3)'
        octx.lineWidth = isMeasureStart ? 2 : 1
        octx.beginPath()
        octx.moveTo(x, 0)
        octx.lineTo(x, height)
        octx.stroke()
        if (isMeasureStart && zoomLevel > 3) {
          octx.fillStyle = 'rgba(239,68,68,0.8)'
          octx.font = '11px monospace'
          octx.fillText(`${Math.floor(index / MEASURE_BEATS) + 1}`, x + 4, 14)
        }
      }
    }

    if (offset >= vStart && offset <= vEnd) {
      const x = toX(offset)
      octx.strokeStyle = '#22c55e'
      octx.lineWidth = 2
      octx.beginPath()
      octx.moveTo(x, 0)
      octx.lineTo(x, height)
      octx.stroke()
      octx.fillStyle = '#22c55e'
      octx.font = '10px sans-serif'
      octx.fillText('Offset', x + 4, height - 6)
    }

    if (head >= vStart && head <= vEnd) {
      const x = toX(head)
      octx.strokeStyle = playing ? '#eab308' : 'rgba(234,179,8,0.7)'
      octx.lineWidth = playing ? 3 : 2
      octx.beginPath()
      octx.moveTo(x, 0)
      octx.lineTo(x, height)
      octx.stroke()
    }
  }, [getViewRange])

  useEffect(() => {
    if (!isPlaying) return
    let raf = 0
    const tick = (): void => {
      draw()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying, draw])

  useEffect(() => {
    if (isPlaying) return
    const raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying, draw, audioBuffer, segments, offsetMs, zoom, viewStartMs, durationMs, playheadMs])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => draw())
    observer.observe(container)
    return () => observer.disconnect()
  }, [draw])

  const visibleRangeMs = durationMs > 0 ? Math.max(MIN_VIEW_RANGE_MS, durationMs / zoom) : 0
  const maxStart = Math.max(0, durationMs - visibleRangeMs)

  const handleMouseDown = (e: React.MouseEvent): void => {
    dragging.current = { startX: e.clientX, startView: getViewRange().vStart }
    clickArmed.current = true
  }

  const handleMouseMove = (e: React.MouseEvent): void => {
    if (!dragging.current || !durationMs) return
    const dx = e.clientX - dragging.current.startX
    if (Math.abs(dx) <= DRAG_THRESHOLD_PX) return
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
