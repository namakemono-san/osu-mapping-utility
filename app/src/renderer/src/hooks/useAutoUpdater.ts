import { useCallback, useEffect, useRef, useState } from 'react'

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'upToDate'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdaterInfo {
  version?: string
  releaseDate?: string
  releaseNotes?: string | null
}

export interface UpdaterProgress {
  percent: number
  transferred: number
  total: number
}

export interface AutoUpdaterState {
  status: UpdaterStatus
  info: UpdaterInfo
  progress: UpdaterProgress | null
  errorMessage: string | null
  checkNow: () => Promise<void>
  startDownload: () => void
  dismiss: () => void
}

function readReceiveCanary(): boolean {
  try {
    const raw = localStorage.getItem('receiveCanary')
    return raw != null ? (JSON.parse(raw) as boolean) : false
  } catch {
    return false
  }
}

export function useAutoUpdater(autoCheckDelayMs = 3000): AutoUpdaterState {
  const [status, setStatus] = useState<UpdaterStatus>('idle')
  const [info, setInfo] = useState<UpdaterInfo>({})
  const [progress, setProgress] = useState<UpdaterProgress | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const statusRef = useRef(status)
  useEffect(() => {
    statusRef.current = status
  }, [status])

  const checkNow = useCallback(async () => {
    setStatus('checking')
    setErrorMessage(null)
    const result = await window.api.updater.check(readReceiveCanary())
    if (result.status === 'available') {
      setInfo({
        version: result.version,
        releaseDate: result.releaseDate,
        releaseNotes: result.releaseNotes
      })
    }
    if (result.status === 'error') setErrorMessage('Failed to check for updates.')
    setStatus(result.status)
  }, [])

  const startDownload = useCallback(() => {
    setStatus('downloading')
    setProgress({ percent: 0, transferred: 0, total: 0 })
    void window.api.updater.download()
  }, [])

  const dismiss = useCallback(() => {
    setStatus('idle')
    setErrorMessage(null)
  }, [])

  useEffect(() => {
    const offProgress = window.api.updater.onDownloadProgress((p) => setProgress(p))
    const offDownloaded = window.api.updater.onDownloaded(() => setStatus('downloaded'))
    const offError = window.api.updater.onError((message) => {
      setErrorMessage(message)
      setStatus('error')
    })
    return () => {
      offProgress()
      offDownloaded()
      offError()
    }
  }, [])

  useEffect(() => {
    const id = setTimeout(() => {
      if (statusRef.current === 'idle') void checkNow()
    }, autoCheckDelayMs)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { status, info, progress, errorMessage, checkNow, startDownload, dismiss }
}
