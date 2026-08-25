import { HubClient } from './connection'
import type { AudioGroup, BpmAnalysis } from './types'

const hub = new HubClient('/audio', { serverTimeoutMs: 3_600_000 })

export const startAudioConnection = (): Promise<boolean> => hub.start()

export const analyzeAudio = (folderPath: string): Promise<AudioGroup[]> =>
  hub.invokeJson<AudioGroup[]>('AnalyzeAudio', folderPath)

export const analyzeBpm = (folderPath: string, audioFilename: string): Promise<BpmAnalysis> =>
  hub.invokeJson<BpmAnalysis>('AnalyzeBpm', folderPath, audioFilename)

export async function analyzeAudioOffset(
  folderPath: string,
  audioFilename: string,
  bpm: number
): Promise<number> {
  const result = await hub.invokeJson<{ offsetMs: number }>(
    'AnalyzeOffset',
    folderPath,
    audioFilename,
    bpm
  )
  return result.offsetMs
}

export const getSpectrogram = (
  folderPath: string,
  audioFilename: string,
  cutoffHz: number
): Promise<string> => hub.invoke<string>('GetSpectrogram', folderPath, audioFilename, cutoffHz)
