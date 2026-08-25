import { HubClient } from './connection'
import type {
  Beatmapset,
  CloneRequest,
  CurrentBeatmapResult,
  DiffBackground,
  DiffMetadata,
  MetadataUpdate,
  TimingInfo
} from './types'

const hub = new HubClient('/beatmapset')

export const startConnection = (): Promise<boolean> => hub.start()

export function scanBeatmapsets(
  onTotal: (count: number) => void,
  onChunk: (beatmapsets: Beatmapset[]) => void,
  songsPath?: string,
  forceRefresh = false
): Promise<void> {
  return hub.invokeWithEvents(
    'ScanBeatmapsets',
    [songsPath ?? null, forceRefresh],
    'BeatmapsetsScanComplete',
    'ScanError',
    [
      ['BeatmapsetsTotalCount', (count: number) => onTotal(count)],
      ['BeatmapsetsChunk', (json: string) => onChunk(JSON.parse(json) as Beatmapset[])]
    ]
  )
}

export function searchBeatmapsets(
  query: string,
  onChunk: (beatmapsets: Beatmapset[]) => void
): Promise<void> {
  return hub.invokeWithEvents('SearchBeatmapsets', [query], 'SearchComplete', 'ScanError', [
    ['SearchChunk', (json: string) => onChunk(JSON.parse(json) as Beatmapset[])]
  ])
}

export const fetchBeatmapsets = (startIndex: number, count: number): Promise<Beatmapset[]> =>
  hub.invokeJson<Beatmapset[]>('FetchBeatmapsets', startIndex, count)

export const getSongsPath = (): Promise<string | null> => hub.invoke<string | null>('GetSongsPath')

export const getCurrentBeatmap = (): Promise<CurrentBeatmapResult> =>
  hub.invokeJson<CurrentBeatmapResult>('GetCurrentBeatmap')

export const onBeatmapsetsListChanged = (cb: () => void): (() => void) =>
  hub.on('BeatmapsetsListChanged', () => cb())

export const onBeatmapsetChanged = (
  cb: (folderPath: string, beatmapset: Beatmapset | null) => void
): (() => void) =>
  hub.on('BeatmapsetChanged', (folderPath: string, json: string | null) =>
    cb(folderPath, json ? (JSON.parse(json) as Beatmapset) : null)
  )

export const getBeatmapsetMetadata = (folderPath: string): Promise<DiffMetadata[]> =>
  hub.invokeJson<DiffMetadata[]>('GetBeatmapsetMetadata', folderPath)

export const getTimingInfo = (folderPath: string): Promise<TimingInfo[]> =>
  hub.invokeJson<TimingInfo[]>('GetTimingInfo', folderPath)

export function applyMetadata(
  folderPath: string,
  versions: string[],
  update: MetadataUpdate
): Promise<void> {
  return hub.invokeWithEvents(
    'ApplyMetadata',
    [folderPath, versions, update],
    'MetadataComplete',
    'MetadataError'
  )
}

export function applyBackgrounds(folderPath: string, backgrounds: DiffBackground[]): Promise<void> {
  return hub.invokeWithEvents(
    'ApplyBackgrounds',
    [folderPath, backgrounds],
    'BackgroundComplete',
    'BackgroundError'
  )
}

export function applyTransforms(
  folderPath: string,
  versions: string[],
  transformIds: string[],
  backup: boolean
): Promise<void> {
  return hub.invokeWithEvents(
    'ApplyTransforms',
    [folderPath, versions, transformIds, backup],
    'TransformComplete',
    'TransformError'
  )
}

export const applyOffset = (
  folderPath: string,
  versions: string[],
  deltaMs: number
): Promise<void> => hub.invoke('ApplyOffset', folderPath, versions, deltaMs)

export const cloneBeatmap = (req: CloneRequest): Promise<string> =>
  hub.invoke<string>('CloneBeatmap', req)
