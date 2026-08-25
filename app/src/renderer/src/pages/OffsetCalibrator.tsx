import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { EmptyState } from '../components/EmptyState'
import { AdjustButtons } from '../components/offset/AdjustButtons'
import { BeatWaveformList } from '../components/offset/BeatWaveformList'
import { WaveformCanvas } from '../components/offset/WaveformCanvas'
import { useAudioPlayer } from '../hooks/useAudioPlayer'
import { useBeatmapsetRevision } from '../hooks/useBeatmapsetRevision'
import { useMetronome } from '../hooks/useMetronome'
import {
  analyzeAudioOffset,
  analyzeBpm,
  applyOffset,
  getTimingInfo,
  type Beatmapset,
  type TimingInfo
} from '../services'
import { assetUrl } from '../utils/paths'
import { clampViewStart, formatTime, sanitizeBpm, segmentIndexAt } from '../utils/timing'
import { jsonCodec, useLocalStorage } from '../utils/useLocalStorage'

const MIN_VIEW_RANGE_MS = 200
const MIN_ZOOM = 1
const MAX_ZOOM = 128
const INITIAL_ZOOM = 100
const MAX_ADJUST_BPM = 400

const BTN =
  'h-8 inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm bg-surface-raised text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const CHIP =
  'h-8 inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border-subtle bg-surface-dark px-2.5 text-sm'
const INPUT =
  'h-8 rounded-md border border-border-subtle bg-surface-dark px-2 text-sm leading-tight outline-none focus:border-primary'
const PANEL = 'rounded-lg border border-border-subtle bg-surface-dark'

interface OffsetCalibratorProps {
  beatmapset: Beatmapset | null
}

export function OffsetCalibrator({ beatmapset }: OffsetCalibratorProps): React.JSX.Element {
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

  const [playVol, setPlayVol] = useLocalStorage('calibrator:playVolume', 0.35, jsonCodec<number>())
  const [metroVol, setMetroVol] = useLocalStorage(
    'calibrator:metroVolume',
    0.25,
    jsonCodec<number>()
  )
  const [metroOn, setMetroOn] = useLocalStorage('calibrator:metroOn', true, jsonCodec<boolean>())

  const [zoom, setZoom] = useState(INITIAL_ZOOM)
  const [viewStartMs, setViewStartMs] = useState(0)
  const [applyToAll, setApplyToAll] = useState(true)
  const [busy, setBusy] = useState(false)

  const folderPath = beatmapset?.folderPath
  const revision = useBeatmapsetRevision(folderPath)

  const {
    playing,
    currentMs,
    durationMs,
    ensureAudioCtx,
    getCurrentPlayheadMs,
    songMsToCtxTime,
    play,
    seek,
    toggle
  } = useAudioPlayer(audioBuffer, playVol)

  const currentTiming = timingInfos.find((t) => t.version === selectedVersion) ?? timingInfos[0]
  const currentPoint = currentTiming?.points[selectedPointIndex] ?? currentTiming?.points[0]
  const deltaMs = currentPoint != null ? offsetMs - Math.round(currentPoint.time) : null
  const audioFilename = currentTiming?.audioFilename || null
  const audioUrl = assetUrl(folderPath, audioFilename)
  const visibleRangeMs = durationMs > 0 ? Math.max(MIN_VIEW_RANGE_MS, durationMs / zoom) : 0
  const effectiveBpm = ctrlBoost ? bpm * 2 : bpm

  const selectSection = useCallback(
    (index: number): void => {
      const point = currentTiming?.points[index]
      if (!point) return
      setSelectedPointIndex(index)
      setBpm(Math.round(point.bpm))
      setOffsetMs(Math.round(point.time))
    },
    [currentTiming]
  )

  const segments = useMemo(
    () =>
      currentTiming?.points.map((point, i) => ({
        time: point.time + (deltaMs ?? 0),
        bpm: sanitizeBpm(i === selectedPointIndex ? effectiveBpm : point.bpm)
      })) ?? [],
    [currentTiming, selectedPointIndex, effectiveBpm, deltaMs]
  )

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
      const index = segmentIndexAt(currentTiming.points, getCurrentPlayheadMs())
      if (index !== lastAutoSectionRef.current) {
        lastAutoSectionRef.current = index
        selectSection(index)
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

  useEffect(() => {
    setTimingInfos([])
    setBpmCandidates([])
    setAudioBuffer(null)
    setZoom(INITIAL_ZOOM)
    setViewStartMs(0)
    setSelectedVersion(beatmapset?.difficulties[0]?.version ?? '')
    if (!folderPath) {
      setBpm(120)
      setOffsetMs(0)
      return
    }

    let cancelled = false
    getTimingInfo(folderPath)
      .then((infos) => {
        if (!cancelled) setTimingInfos(infos)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderPath])

  useEffect(() => {
    if (!folderPath || revision === 0) return
    let cancelled = false
    getTimingInfo(folderPath)
      .then((infos) => {
        if (!cancelled) setTimingInfos(infos)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [folderPath, revision])

  const prevVersionRef = useRef<string | null>(null)
  useEffect(() => {
    if (!currentTiming) return
    const versionChanged = prevVersionRef.current !== selectedVersion
    prevVersionRef.current = selectedVersion
    const index = versionChanged ? 0 : Math.min(selectedPointIndex, currentTiming.points.length - 1)
    if (versionChanged) setSelectedPointIndex(index)
    const point = currentTiming.points[index]
    if (point) {
      setBpm(Math.round(point.bpm))
      setOffsetMs(Math.round(point.time))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVersion, timingInfos])

  useEffect(() => {
    setAudioBuffer(null)
    if (!audioUrl) return

    let cancelled = false
    const ctx = ensureAudioCtx()
    fetch(audioUrl)
      .then((response) => response.arrayBuffer())
      .then((raw) => ctx.decodeAudioData(raw))
      .then((decoded) => {
        if (!cancelled) setAudioBuffer(decoded)
      })
      .catch((e: unknown) => {
        console.error('Failed to decode audio for waveform display:', e)
      })
    return () => {
      cancelled = true
    }
  }, [audioUrl, ensureAudioCtx])

  const zoomAt = useCallback(
    (factor: number): void => {
      if (!durationMs) return
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor))
      if (next === zoom) return
      const nextRange = durationMs / next
      const anchor = getCurrentPlayheadMs()
      setZoom(next)
      setViewStartMs(clampViewStart(anchor - nextRange / 2, durationMs, nextRange))
    },
    [durationMs, zoom, getCurrentPlayheadMs]
  )

  const handleSeek = (ms: number): void => {
    seek(ms)
    if (!playing) setViewStartMs(Math.max(0, ms - visibleRangeMs / 2))
  }

  const handleWheel = (e: React.WheelEvent): void => {
    e.preventDefault()
    if (e.ctrlKey || e.shiftKey || e.metaKey) {
      zoomAt(Math.exp(-e.deltaY * 0.0015))
      return
    }
    const pan = e.deltaY * (visibleRangeMs / 600)
    const max = Math.max(0, durationMs - visibleRangeMs)
    setViewStartMs((value) => Math.max(0, Math.min(max, value + pan)))
  }

  const handleAnalyzeBpm = async (): Promise<void> => {
    if (!folderPath || !audioFilename) return
    setAnalyzing(true)
    try {
      const result = await analyzeBpm(folderPath, audioFilename)
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
    if (!folderPath || !audioFilename) return
    setAnalyzingOffset(true)
    try {
      setOffsetMs(await analyzeAudioOffset(folderPath, audioFilename, bpm))
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
      setTimingInfos(await getTimingInfo(beatmapset.folderPath))
      toast.success(`Offset shifted by ${deltaMs >= 0 ? '+' : ''}${deltaMs} ms`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to apply.')
    } finally {
      setBusy(false)
    }
  }

  if (!beatmapset) return <EmptyState icon={IconHeadphones} message="Select a beatmapset" />

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
          <button onClick={() => play(0)} disabled={!audioBuffer} className={BTN}>
            <IconPlayerSkipBack size={14} stroke={1.5} />
          </button>
          <button onClick={toggle} disabled={!audioBuffer} className={BTN}>
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
              max={MAX_ADJUST_BPM}
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
                  {currentTiming.points.map((point, i) => (
                    <option key={i} value={i}>
                      {i + 1}/{currentTiming.points.length}: {Math.round(point.bpm)} BPM @{' '}
                      {formatTime(point.time)}
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
              playheadMs={currentMs}
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
                  setZoom(MIN_ZOOM)
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
                bpmCandidates.map((candidate) => (
                  <button
                    key={candidate}
                    onClick={() => setBpm(candidate)}
                    className={`h-8 rounded-md px-2 text-sm transition-colors ${
                      candidate === bpm
                        ? 'bg-primary text-white'
                        : 'bg-surface-raised text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                    }`}
                  >
                    {candidate}
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
