import { useCallback, useEffect, useRef } from 'react'

const METER_BEATS = 4
const LOOK_AHEAD_MS = 25
const SCHEDULE_AHEAD_SEC = 0.25

const METRONOME_SOUND_URLS = {
  tick: ['sounds/metronome/metronome-tick.wav'],
  tickDownbeat: ['sounds/metronome/metronome-tick-downbeat.wav']
} as const

interface MetronomeSounds {
  tick: AudioBuffer
  tickDownbeat: AudioBuffer
}

export interface MetronomeSegment {
  time: number
  bpm: number
}

let cachedMetronomeSounds: MetronomeSounds | null = null
let loadingPromise: Promise<MetronomeSounds> | null = null

function looksLikeAudioData(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 4) return false
  const sig = new Uint8Array(buf.slice(0, 4))
  const txt = String.fromCharCode(sig[0], sig[1], sig[2], sig[3])
  return txt === 'RIFF' || txt === 'OggS' || txt === 'ID3' || txt === 'fLaC'
}

async function decodeAudioFromUrl(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const assetUrl = new URL(url, window.location.href).toString()
  const response = await fetch(assetUrl, { cache: 'no-store' })
  if (!response.ok || response.headers.get('content-type')?.includes('text/html')) {
    throw new Error(`Failed to load metronome sound: ${assetUrl}`)
  }
  const arr = await response.arrayBuffer()
  if (!looksLikeAudioData(arr)) {
    throw new Error(`Invalid audio binary for metronome sound: ${assetUrl}`)
  }
  return await ctx.decodeAudioData(arr.slice(0))
}

async function decodeAudioFromCandidates(
  ctx: AudioContext,
  candidates: readonly string[]
): Promise<AudioBuffer> {
  let lastError: unknown = null
  for (const url of candidates) {
    try {
      return await decodeAudioFromUrl(ctx, url)
    } catch (err) {
      lastError = err
    }
  }
  throw lastError ?? new Error('No metronome sound candidates succeeded')
}

async function loadMetronomeSounds(ctx: AudioContext): Promise<MetronomeSounds> {
  if (cachedMetronomeSounds) return cachedMetronomeSounds
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    const [tick, tickDownbeat] = await Promise.all([
      decodeAudioFromCandidates(ctx, METRONOME_SOUND_URLS.tick),
      decodeAudioFromCandidates(ctx, METRONOME_SOUND_URLS.tickDownbeat)
    ])

    cachedMetronomeSounds = { tick, tickDownbeat }
    return cachedMetronomeSounds
  })()

  try {
    return await loadingPromise
  } finally {
    loadingPromise = null
  }
}

const limiterNodes = new WeakMap<AudioContext, DynamicsCompressorNode>()

function ensureLimiter(ctx: AudioContext): DynamicsCompressorNode {
  let limiter = limiterNodes.get(ctx)
  if (!limiter) {
    limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -18
    limiter.knee.value = 6
    limiter.ratio.value = 20
    limiter.attack.value = 0.001
    limiter.release.value = 0.1
    limiter.connect(ctx.destination)
    limiterNodes.set(ctx, limiter)
  }
  return limiter
}

function playMetronomeSound(
  ctx: AudioContext,
  buffer: AudioBuffer,
  whenSec: number,
  volume: number
): AudioBufferSourceNode {
  const src = ctx.createBufferSource()
  const gain = ctx.createGain()
  src.buffer = buffer
  src.connect(gain)
  gain.connect(ensureLimiter(ctx))
  gain.gain.setValueAtTime(Math.min(1, Math.max(0, volume)), whenSec)
  src.start(whenSec)
  return src
}

function segmentIndexAt(segments: readonly MetronomeSegment[], songMs: number): number {
  let idx = 0
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].time <= songMs) idx = i
    else break
  }
  return idx
}

export interface UseMetronomeOptions {
  segments: MetronomeSegment[]
  metroOn: boolean
  metroVol: number
  isPlaying: boolean
  getCurrentPlayheadMs: () => number
  songMsToCtxTime: (songMs: number) => number
  ensureAudioCtx: () => AudioContext
}

export function useMetronome({
  segments,
  metroOn,
  metroVol,
  isPlaying,
  getCurrentPlayheadMs,
  songMsToCtxTime,
  ensureAudioCtx
}: UseMetronomeOptions): void {
  const schedulerRef = useRef<number | null>(null)
  const segmentIndexRef = useRef(0)
  const nextBeatIndexRef = useRef(0)
  const soundsRef = useRef<MetronomeSounds | null>(cachedMetronomeSounds)
  const startMetroRef = useRef<() => void>(() => {})
  const lastClickWhenRef = useRef(-Infinity)
  const pendingRef = useRef<{ src: AudioBufferSourceNode; when: number }[]>([])

  const cancelPendingClicks = useCallback((ctx: AudioContext) => {
    for (const { src, when } of pendingRef.current) {
      if (when <= ctx.currentTime) continue
      try {
        src.onended = null
        src.stop()
      } catch {
        /* already stopped/ended */
      }
    }
    pendingRef.current = []
  }, [])

  const clickSound = useCallback(
    (whenSec: number, strong: boolean) => {
      const ctx = ensureAudioCtx()
      const sounds = soundsRef.current
      if (!sounds) return
      const buffer = strong ? sounds.tickDownbeat : sounds.tick
      const src = playMetronomeSound(ctx, buffer, whenSec, metroVol)
      pendingRef.current = pendingRef.current.filter((p) => p.when > ctx.currentTime)
      pendingRef.current.push({ src, when: whenSec })
    },
    [ensureAudioCtx, metroVol]
  )

  useEffect(() => {
    if (!metroOn) return
    const ctx = ensureAudioCtx()
    let mounted = true

    void loadMetronomeSounds(ctx)
      .then((sounds) => {
        if (!mounted) return
        soundsRef.current = sounds
      })
      .catch((err: unknown) => {
        console.error('Metronome sound loading failed.', err)
      })

    return () => {
      mounted = false
    }
  }, [metroOn, ensureAudioCtx])

  const resetMetroPhase = useCallback(() => {
    cancelPendingClicks(ensureAudioCtx())
    const nowSong = getCurrentPlayheadMs()
    const segIdx = segmentIndexAt(segments, nowSong)
    segmentIndexRef.current = segIdx
    const seg = segments[segIdx]
    if (!seg) {
      nextBeatIndexRef.current = 0
      return
    }
    const beatMs = 60000 / Math.max(1, seg.bpm)
    const rel = nowSong - seg.time
    nextBeatIndexRef.current = rel <= 0 ? 0 : Math.ceil(rel / beatMs)
    lastClickWhenRef.current = -Infinity
  }, [segments, getCurrentPlayheadMs, ensureAudioCtx, cancelPendingClicks])

  const stopMetro = useCallback(() => {
    if (schedulerRef.current) {
      window.clearInterval(schedulerRef.current)
      schedulerRef.current = null
    }
    cancelPendingClicks(ensureAudioCtx())
  }, [ensureAudioCtx, cancelPendingClicks])

  const startMetro = useCallback(() => {
    if (!metroOn || !isPlaying || segments.length === 0) return
    if (!soundsRef.current) {
      const ctx = ensureAudioCtx()
      void loadMetronomeSounds(ctx)
        .then((sounds) => {
          soundsRef.current = sounds
          if (metroOn && isPlaying) startMetroRef.current()
        })
        .catch((err: unknown) => {
          console.error('Metronome sound loading failed.', err)
        })
      return
    }

    stopMetro()
    resetMetroPhase()
    const ctx = ensureAudioCtx()

    schedulerRef.current = window.setInterval(() => {
      if (!metroOn || !isPlaying) return
      const nowCtx = ctx.currentTime
      const nowSong = getCurrentPlayheadMs()

      const trackedSeg = segments[segmentIndexRef.current]
      if (trackedSeg) {
        const trackedBeatMs = 60000 / Math.max(1, trackedSeg.bpm)
        const trackedSongT = trackedSeg.time + nextBeatIndexRef.current * trackedBeatMs
        if (Math.abs(trackedSongT - nowSong) > trackedBeatMs * 2) {
          resetMetroPhase()
        }
      }

      const MAX_BEATS_PER_TICK = 16
      const MIN_CLICK_GAP_SEC = 0.03
      for (let guard = 0; guard < MAX_BEATS_PER_TICK; guard++) {
        const seg = segments[segmentIndexRef.current]
        if (!seg) break
        const beatMs = 60000 / Math.max(1, seg.bpm)
        const songT = seg.time + nextBeatIndexRef.current * beatMs

        const nextSeg = segments[segmentIndexRef.current + 1]
        if (nextSeg && songT >= nextSeg.time) {
          segmentIndexRef.current += 1
          nextBeatIndexRef.current = 0
          continue
        }

        const when = songMsToCtxTime(songT)
        if (when - nowCtx <= SCHEDULE_AHEAD_SEC) {
          if (songT >= nowSong - 10) {
            const clampedWhen = Math.max(nowCtx, when)
            if (clampedWhen - lastClickWhenRef.current >= MIN_CLICK_GAP_SEC) {
              const strong = nextBeatIndexRef.current % METER_BEATS === 0
              clickSound(clampedWhen, strong)
              lastClickWhenRef.current = clampedWhen
            }
          }
          nextBeatIndexRef.current += 1
        } else break
      }
    }, LOOK_AHEAD_MS) as unknown as number
  }, [
    segments,
    ensureAudioCtx,
    getCurrentPlayheadMs,
    isPlaying,
    metroOn,
    songMsToCtxTime,
    stopMetro,
    clickSound,
    resetMetroPhase
  ])

  useEffect(() => {
    startMetroRef.current = startMetro
  }, [startMetro])

  useEffect(() => {
    if (metroOn && isPlaying) startMetro()
    else stopMetro()
    return () => stopMetro()
  }, [metroOn, isPlaying, startMetro, stopMetro])

  useEffect(() => {
    return () => {
      if (schedulerRef.current) {
        window.clearInterval(schedulerRef.current)
        schedulerRef.current = null
      }
    }
  }, [])
}
