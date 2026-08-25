export type DifficultyRef = {
  version: string
  mode: number
}

export type Beatmapset = {
  id: number
  title: string
  artist: string
  creator: string
  folderPath: string
  backgroundFile: string | null
  difficulties: DifficultyRef[]
  mode: number
}

export type CurrentBeatmapResult = {
  status: string
  message: string | null
  detectedFilename: string | null
  beatmapset: Beatmapset | null
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

export type TimingPointInfo = {
  time: number
  bpm: number
}

export type TimingInfo = {
  version: string
  audioFilename: string
  points: TimingPointInfo[]
}

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

export type MediaDownloadOptions = {
  audioEnabled: boolean
  audioFormat: 'mp3' | 'ogg'
  videoEnabled: boolean
  videoMode: 'normal' | 'taiko'
}
