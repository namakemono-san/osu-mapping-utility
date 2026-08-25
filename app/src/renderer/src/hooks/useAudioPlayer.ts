import { useCallback, useEffect, useRef, useState } from 'react'

const END_TOLERANCE_MS = 10

export interface AudioPlayer {
  playing: boolean
  currentMs: number
  durationMs: number
  ensureAudioCtx: () => AudioContext
  getCurrentPlayheadMs: () => number
  songMsToCtxTime: (songMs: number) => number
  play: (ms: number) => void
  stop: (reset?: boolean) => void
  seek: (ms: number) => void
  toggle: () => void
}

export function useAudioPlayer(audioBuffer: AudioBuffer | null, volume: number): AudioPlayer {
  const [playing, setPlaying] = useState(false)
  const [currentMs, setCurrentMs] = useState(0)

  const ctxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const bufferRef = useRef<AudioBuffer | null>(audioBuffer)
  const volumeRef = useRef(volume)
  const durationMsRef = useRef(0)
  const playingRef = useRef(false)
  const playStartAtRef = useRef(0)
  const playStartCtxTimeRef = useRef(0)
  const cursorMsRef = useRef(0)
  const mountedRef = useRef(true)

  const durationMs = audioBuffer ? audioBuffer.duration * 1000 : 0

  const ensureAudioCtx = useCallback((): AudioContext => {
    if (!ctxRef.current) ctxRef.current = new AudioContext()
    return ctxRef.current
  }, [])

  const getCurrentPlayheadMs = useCallback((): number => {
    const ctx = ctxRef.current
    if (!playingRef.current || !ctx) return cursorMsRef.current
    const elapsed = (ctx.currentTime - playStartCtxTimeRef.current) * 1000
    return Math.min(durationMsRef.current, playStartAtRef.current + elapsed)
  }, [])

  const songMsToCtxTime = useCallback(
    (songMs: number): number =>
      playStartCtxTimeRef.current + (songMs - playStartAtRef.current) / 1000,
    []
  )

  const releaseSource = useCallback(() => {
    const source = sourceRef.current
    if (!source) return
    source.onended = null
    try {
      source.stop()
      // eslint-disable-next-line no-empty
    } catch {}
    source.disconnect()
    sourceRef.current = null
  }, [])

  const markStopped = useCallback((cursorMs: number) => {
    setPlaying(false)
    playingRef.current = false
    playStartAtRef.current = 0
    playStartCtxTimeRef.current = 0
    cursorMsRef.current = cursorMs
    setCurrentMs(cursorMs)
  }, [])

  const stop = useCallback(
    (reset = false) => {
      const cursor = reset ? 0 : Math.max(0, getCurrentPlayheadMs())
      releaseSource()
      markStopped(cursor)
    },
    [getCurrentPlayheadMs, releaseSource, markStopped]
  )

  const play = useCallback(
    (ms: number) => {
      const buffer = bufferRef.current
      if (!buffer) return
      const ctx = ensureAudioCtx()

      void ctx.resume().then(() => {
        if (!mountedRef.current || bufferRef.current !== buffer) return
        stop()

        const source = ctx.createBufferSource()
        const gain = ctx.createGain()
        source.buffer = buffer
        source.connect(gain)
        gain.connect(ctx.destination)
        gain.gain.value = volumeRef.current

        source.start(0, Math.max(0, ms / 1000))
        source.onended = () => {
          if (!mountedRef.current) return
          markStopped(durationMsRef.current)
        }

        sourceRef.current = source
        gainRef.current = gain

        setPlaying(true)
        playingRef.current = true
        playStartAtRef.current = ms
        playStartCtxTimeRef.current = ctx.currentTime
        cursorMsRef.current = ms
        setCurrentMs(ms)
      })
    },
    [ensureAudioCtx, stop, markStopped]
  )

  const seek = useCallback(
    (ms: number) => {
      const next = Math.max(0, Math.min(durationMsRef.current, ms))
      if (playingRef.current) {
        play(next)
        return
      }
      cursorMsRef.current = next
      setCurrentMs(next)
    },
    [play]
  )

  const toggle = useCallback(() => {
    if (playingRef.current) {
      stop()
      return
    }
    const atEnd =
      durationMsRef.current > 0 && cursorMsRef.current >= durationMsRef.current - END_TOLERANCE_MS
    play(atEnd ? 0 : cursorMsRef.current)
  }, [play, stop])

  useEffect(() => {
    volumeRef.current = volume
    if (gainRef.current) gainRef.current.gain.value = volume
  }, [volume])

  useEffect(() => {
    bufferRef.current = audioBuffer
    durationMsRef.current = durationMs
    releaseSource()
    markStopped(0)
  }, [audioBuffer, durationMs, releaseSource, markStopped])

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
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      releaseSource()
      ctxRef.current?.close().catch(() => {})
      ctxRef.current = null
    }
  }, [releaseSource])

  return {
    playing,
    currentMs,
    durationMs,
    ensureAudioCtx,
    getCurrentPlayheadMs,
    songMsToCtxTime,
    play,
    stop,
    seek,
    toggle
  }
}
