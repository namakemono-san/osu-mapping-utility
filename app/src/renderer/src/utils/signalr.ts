import * as signalR from '@microsoft/signalr'

export type Beatmapset = {
  id: number
  title: string
  artist: string
  creator: string
  folderPath: string
  backgroundFile: string | null
  difficulties: { version: string; mode: number }[]
  mode: number
}

function createReconnectingConnection(
  url: string,
  options?: { serverTimeoutMs?: number }
): { connection: signalR.HubConnection; start: () => Promise<boolean> } {
  let builder = new signalR.HubConnectionBuilder()
    .withUrl(url)
    .withAutomaticReconnect()
    .configureLogging(signalR.LogLevel.Warning)
  if (options?.serverTimeoutMs !== undefined)
    builder = builder.withServerTimeout(options.serverTimeoutMs)
  const connection = builder.build()

  let connectPromise: Promise<boolean> | null = null

  const start = (): Promise<boolean> => {
    if (connection.state === signalR.HubConnectionState.Connected) return Promise.resolve(true)
    if (connectPromise) return connectPromise

    connectPromise = (async () => {
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          await connection.start()
          return true
        } catch {
          if (attempt < 9) await new Promise((r) => setTimeout(r, 2000))
        }
      }
      return false
    })().finally(() => {
      connectPromise = null
    })

    return connectPromise
  }

  return { connection, start }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventHandler = (...args: any[]) => void

const DEFAULT_INVOKE_TIMEOUT_MS = 120_000

function invokeWithEvents(
  connection: signalR.HubConnection,
  method: string,
  args: unknown[],
  completeEvent: string,
  errorEvent: string,
  extraHandlers: Array<[string, EventHandler]> = [],
  timeoutMs = DEFAULT_INVOKE_TIMEOUT_MS
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false

    const cleanup = (): void => {
      clearTimeout(timer)
      connection.off(completeEvent, onComplete)
      connection.off(errorEvent, onError)
      for (const [event, handler] of extraHandlers) connection.off(event, handler)
    }
    const onComplete = (): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }
    const onError = (message: string): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(message))
    }
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(`Timed out waiting for ${method} to complete`))
    }, timeoutMs)

    connection.on(completeEvent, onComplete)
    connection.on(errorEvent, onError)
    for (const [event, handler] of extraHandlers) connection.on(event, handler)

    connection.invoke(method, ...args).catch((err: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(err instanceof Error ? err : new Error(String(err)))
    })
  })
}

const { connection, start: startConnection } = createReconnectingConnection(
  'http://localhost:7002/beatmapset'
)
export { startConnection }

export function scanBeatmapsets(
  onTotal: (count: number) => void,
  onChunk: (beatmapsets: Beatmapset[]) => void,
  songsPath?: string,
  forceRefresh = false
): Promise<void> {
  const onTotalHandler: EventHandler = (count: number) => onTotal(count)
  const onChunkHandler: EventHandler = (json: string) => onChunk(JSON.parse(json) as Beatmapset[])
  return invokeWithEvents(
    connection,
    'ScanBeatmapsets',
    [songsPath ?? null, forceRefresh],
    'BeatmapsetsScanComplete',
    'ScanError',
    [
      ['BeatmapsetsTotalCount', onTotalHandler],
      ['BeatmapsetsChunk', onChunkHandler]
    ]
  )
}

export async function getSongsPath(): Promise<string | null> {
  return connection.invoke<string | null>('GetSongsPath')
}

export type CurrentBeatmapResult = {
  status: string
  message: string | null
  detectedFilename: string | null
  beatmapset: Beatmapset | null
}

export async function getCurrentBeatmap(): Promise<CurrentBeatmapResult> {
  const json = await connection.invoke<string>('GetCurrentBeatmap')
  return JSON.parse(json) as CurrentBeatmapResult
}

export async function fetchBeatmapsets(startIndex: number, count: number): Promise<Beatmapset[]> {
  const json = await connection.invoke<string>('FetchBeatmapsets', startIndex, count)
  return JSON.parse(json) as Beatmapset[]
}

export function applyTransforms(
  folderPath: string,
  versions: string[],
  transformIds: string[],
  backup: boolean
): Promise<void> {
  return invokeWithEvents(
    connection,
    'ApplyTransforms',
    [folderPath, versions, transformIds, backup],
    'TransformComplete',
    'TransformError'
  )
}

export type DiffBackground = {
  version: string
  filename: string
  offsetX: number
  offsetY: number
}

export type DiffMetadata = {
  version: string
  title: string
  titleUnicode: string
  artist: string
  artistUnicode: string
  source: string
  tags: string
  backgroundFile: string
  backgroundOffsetX: number
  backgroundOffsetY: number
  starRating: number
}

export type MetadataUpdate = {
  title: string
  titleUnicode: string
  artist: string
  artistUnicode: string
  source: string
  tags: string
  backgrounds: DiffBackground[]
}

export async function getBeatmapsetMetadata(folderPath: string): Promise<DiffMetadata[]> {
  const json = await connection.invoke<string>('GetBeatmapsetMetadata', folderPath)
  return JSON.parse(json) as DiffMetadata[]
}

export function applyMetadata(
  folderPath: string,
  versions: string[],
  update: MetadataUpdate
): Promise<void> {
  return invokeWithEvents(
    connection,
    'ApplyMetadata',
    [folderPath, versions, update],
    'MetadataComplete',
    'MetadataError'
  )
}

export function applyBackgrounds(folderPath: string, backgrounds: DiffBackground[]): Promise<void> {
  return invokeWithEvents(
    connection,
    'ApplyBackgrounds',
    [folderPath, backgrounds],
    'BackgroundComplete',
    'BackgroundError'
  )
}

export type CloneRequest = {
  folderPath: string
  templateVersion: string
  gameMode: number
  title: string
  titleUnicode: string
  artist: string
  artistUnicode: string
  source: string
  tags: string
  resetTimingPoints: boolean
  removeSkinFiles: boolean
  copyPreviewTime: boolean
  resetDifficulty: boolean
}

export function cloneBeatmap(req: CloneRequest): Promise<string> {
  return connection.invoke<string>('CloneBeatmap', req)
}

export type TimingInfo = {
  version: string
  bpm: number
  offsetMs: number
}

export async function getTimingInfo(folderPath: string): Promise<TimingInfo[]> {
  const json = await connection.invoke<string>('GetTimingInfo', folderPath)
  return JSON.parse(json) as TimingInfo[]
}

export async function applyOffset(
  folderPath: string,
  versions: string[],
  deltaMs: number
): Promise<void> {
  await connection.invoke('ApplyOffset', folderPath, versions, deltaMs)
}

export function searchBeatmapsets(
  query: string,
  onChunk: (beatmapsets: Beatmapset[]) => void
): Promise<void> {
  const onChunkHandler: EventHandler = (json: string) => onChunk(JSON.parse(json) as Beatmapset[])
  return invokeWithEvents(connection, 'SearchBeatmapsets', [query], 'SearchComplete', 'ScanError', [
    ['SearchChunk', onChunkHandler]
  ])
}

const { connection: downloaderConnection, start: startDownloaderConnection } =
  createReconnectingConnection('http://localhost:7002/downloader', { serverTimeoutMs: 3_600_000 })
export { startDownloaderConnection }

export type MediaDownloadOptions = {
  audioEnabled: boolean
  audioFormat: 'mp3' | 'ogg'
  videoEnabled: boolean
  videoMode: 'normal' | 'taiko'
}

export function startMediaDownload(
  url: string,
  outDir: string,
  options: MediaDownloadOptions
): Promise<void> {
  return downloaderConnection.invoke('StartMediaDownload', {
    url,
    outDir,
    audioEnabled: options.audioEnabled,
    audioFormat: options.audioFormat,
    videoEnabled: options.videoEnabled,
    videoMode: options.videoMode
  })
}

export function startImageDownload(
  input: string,
  outDir: string,
  useWaifu2x: boolean
): Promise<void> {
  return downloaderConnection.invoke('StartImageDownload', { input, outDir, useWaifu2x })
}

export function cancelDownload(): void {
  downloaderConnection.invoke('CancelDownload').catch((e: unknown) => {
    console.error('Failed to cancel download:', e)
  })
}

export function onDownloadProgress(cb: (tag: string, message: string) => void): () => void {
  const handler = (tag: string, message: string): void => cb(tag, message)
  downloaderConnection.on('DownloadProgress', handler)
  return () => downloaderConnection.off('DownloadProgress', handler)
}

const { connection: audioConnection, start: startAudioConnection } = createReconnectingConnection(
  'http://localhost:7002/audio',
  { serverTimeoutMs: 3_600_000 }
)
export { startAudioConnection }

export type CheckIssue = {
  severity: string
  message: string
}

export type AudioGroup = {
  audioFilename: string
  usedByDifficulties: string[]
  format: string
  bitrateKbps: number
  sampleRate: number
  durationMs: number
  fileSizeBytes: number
  cutoffHz: number | null
  issues: CheckIssue[]
}

export type BpmAnalysis = {
  bpm: number
  candidates: number[]
  offsetMs: number
}

export async function analyzeBpm(folderPath: string, audioFilename: string): Promise<BpmAnalysis> {
  const json = await audioConnection.invoke<string>('AnalyzeBpm', folderPath, audioFilename)
  return JSON.parse(json) as BpmAnalysis
}

export async function analyzeAudioOffset(
  folderPath: string,
  audioFilename: string,
  bpm: number
): Promise<number> {
  const json = await audioConnection.invoke<string>('AnalyzeOffset', folderPath, audioFilename, bpm)
  return (JSON.parse(json) as { offsetMs: number }).offsetMs
}

export async function analyzeAudio(folderPath: string): Promise<AudioGroup[]> {
  const json = await audioConnection.invoke<string>('AnalyzeAudio', folderPath)
  return JSON.parse(json) as AudioGroup[]
}

export async function getSpectrogram(
  folderPath: string,
  audioFilename: string,
  cutoffHz: number
): Promise<string> {
  return audioConnection.invoke<string>('GetSpectrogram', folderPath, audioFilename, cutoffHz)
}
