import { HubClient } from './connection'
import type { MediaDownloadOptions } from './types'

const hub = new HubClient('/downloader', { serverTimeoutMs: 3_600_000 })

export const startDownloaderConnection = (): Promise<boolean> => hub.start()

export const startMediaDownload = (
  url: string,
  outDir: string,
  options: MediaDownloadOptions
): Promise<void> => hub.invoke('StartMediaDownload', { url, outDir, ...options })

export const startImageDownload = (
  input: string,
  outDir: string,
  useWaifu2x: boolean
): Promise<void> => hub.invoke('StartImageDownload', { input, outDir, useWaifu2x })

export function cancelDownload(): void {
  hub.invoke('CancelDownload').catch((e: unknown) => {
    console.error('Failed to cancel download:', e)
  })
}

export const onDownloadProgress = (cb: (tag: string, message: string) => void): (() => void) =>
  hub.on('DownloadProgress', (tag: string, message: string) => cb(tag, message))
