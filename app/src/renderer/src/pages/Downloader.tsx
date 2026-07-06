import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import {
  IconDownload,
  IconFolder,
  IconPhoto,
  IconPlayerPlay,
  IconPlayerStop,
  IconX
} from '@tabler/icons-react'
import {
  startDownloaderConnection,
  startMediaDownload,
  startImageDownload,
  cancelDownload,
  onDownloadProgress,
  type MediaDownloadOptions
} from '../utils/signalr'
import { jsonCodec, stringCodec, useLocalStorage } from '../utils/useLocalStorage'
import { Toggle } from '../components/Toggle'

const LS = {
  outDir: 'downloader:outDir',
  audioEnabled: 'downloader:audioEnabled',
  audioFormat: 'downloader:audioFormat',
  videoEnabled: 'downloader:videoEnabled',
  videoMode: 'downloader:videoMode'
} as const

type Mode = 'media' | 'image'
type ImageTab = 'log' | 'preview'
type LogEntry = { tag: string; message: string }

function tagColor(tag: string): string {
  if (tag.includes('[done]')) return 'text-green-400'
  if (tag.includes('[fail]') || tag === '[error]') return 'text-red-400'
  if (tag === '[cancelled]') return 'text-yellow-400'
  if (tag.startsWith('[audio]')) return 'text-sky-400'
  if (tag.startsWith('[video]')) return 'text-blue-400'
  if (tag.startsWith('[taiko]')) return 'text-purple-400'
  if (tag.startsWith('[image]')) return 'text-orange-400'
  return 'text-text-muted'
}

export function Downloader(): React.JSX.Element {
  const [mode, setMode] = useState<Mode>('media')
  const [url, setUrl] = useState('')
  const [imageFile, setImageFile] = useState('')
  const [outDir, setOutDir] = useLocalStorage(LS.outDir, '', stringCodec())
  const [audioEnabled, setAudioEnabled] = useLocalStorage(
    LS.audioEnabled,
    true,
    jsonCodec<boolean>()
  )
  const [audioFormat, setAudioFormat] = useLocalStorage<'mp3' | 'ogg'>(
    LS.audioFormat,
    'mp3',
    stringCodec()
  )
  const [videoEnabled, setVideoEnabled] = useLocalStorage(
    LS.videoEnabled,
    false,
    jsonCodec<boolean>()
  )
  const [videoMode, setVideoMode] = useLocalStorage<'normal' | 'taiko'>(
    LS.videoMode,
    'normal',
    stringCodec()
  )
  const [useWaifu2x, setUseWaifu2x] = useState(false)

  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [imageTab, setImageTab] = useState<ImageTab>('log')

  const [connectionError, setConnectionError] = useState(false)

  const logRef = useRef<HTMLDivElement>(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    startDownloaderConnection().then((ok) => {
      if (!cancelled) setConnectionError(!ok)
    })
    const unsubscribe = onDownloadProgress((tag, message) => {
      setLog((prev) => {
        const next = [...prev, { tag, message }]
        return next.length > 1500 ? next.slice(-1500) : next
      })
      requestAnimationFrame(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
      })
      if (tag === '[cancelled]') cancelledRef.current = true
      if (tag === '[image][done]') {
        const match = message.match(/^Output: (.+)$/)
        if (match) {
          setPreviewPath(match[1])
          setImageTab('preview')
        }
      }
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const pickFolder = useCallback(async () => {
    const dir = await window.api.dialog.pickFolder()
    if (dir) setOutDir(dir)
  }, [])

  const pickImageFile = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp,image/bmp'
    input.addEventListener('change', () => {
      const f = input.files?.[0] as (File & { path: string }) | undefined
      if (!f?.path) return
      setImageFile(f.path)
      setUrl('')
    })
    input.click()
  }, [])

  const handleStart = useCallback(async () => {
    if (busy) return
    cancelledRef.current = false
    setBusy(true)
    setLog([])
    setPreviewPath(null)
    setImageTab('log')
    try {
      if (mode === 'media') {
        const opts: MediaDownloadOptions = { audioEnabled, audioFormat, videoEnabled, videoMode }
        await startMediaDownload(url, outDir, opts)
        if (!cancelledRef.current) {
          if (audioEnabled || videoEnabled) {
            if (outDir) void window.api.shell.openPath(outDir)
          } else {
            toast.success('Done.')
          }
        }
      } else {
        await startImageDownload(imageFile || url, outDir, useWaifu2x)
        if (!cancelledRef.current) toast.success('Done!')
      }
    } catch {
      toast.error('Failed.')
    } finally {
      setBusy(false)
    }
  }, [
    busy,
    mode,
    url,
    outDir,
    audioEnabled,
    audioFormat,
    videoEnabled,
    videoMode,
    imageFile,
    useWaifu2x
  ])

  const handleStop = useCallback(() => {
    cancelDownload()
  }, [])

  const canStart =
    (mode === 'media' ? !!url : !!(imageFile || url)) && !!outDir && !busy && !connectionError
  const previewUrl = previewPath ? `asset:///${previewPath.replace(/\\/g, '/')}` : null

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-dark">
      <div className="flex shrink-0 gap-0.5 border-b border-border-subtle px-3 py-2.5">
        {(['media', 'image'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
              mode === m
                ? 'bg-surface-raised text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {m === 'media' ? 'Media' : 'Image'}
          </button>
        ))}
      </div>

      <div className="shrink-0 space-y-2 p-4">
        <div className="flex items-center overflow-hidden rounded-lg bg-surface">
          <div className="flex min-w-0 flex-1 items-center px-3 py-2">
            {mode === 'image' && imageFile ? (
              <>
                <IconPhoto size={12} className="mr-2 shrink-0 text-text-muted" />
                <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">
                  {imageFile}
                </span>
                <button
                  onClick={() => setImageFile('')}
                  className="ml-1 shrink-0 text-text-muted transition-colors hover:text-text-primary"
                >
                  <IconX size={12} />
                </button>
              </>
            ) : (
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={
                  mode === 'media'
                    ? 'https://www.youtube.com/watch?v=...'
                    : 'YouTube URL / image URL'
                }
                className="w-full bg-transparent text-xs text-text-primary placeholder-text-muted outline-none"
              />
            )}
          </div>
          {mode === 'image' && !imageFile && (
            <>
              <div className="w-px self-stretch bg-border-subtle" />
              <button
                onClick={pickImageFile}
                className="flex shrink-0 items-center gap-1.5 px-3 py-2 text-xs text-text-secondary transition-colors hover:text-text-primary"
              >
                <IconPhoto size={13} />
                File
              </button>
            </>
          )}
          <div className="w-px self-stretch bg-border-subtle" />
          <button
            onClick={pickFolder}
            className="flex shrink-0 items-center gap-1.5 px-3 py-2 text-xs transition-colors hover:text-text-primary"
          >
            <IconFolder size={12} className="shrink-0 text-text-muted" />
            <span
              className={`max-w-32 truncate ${outDir ? 'text-text-secondary' : 'text-text-muted'}`}
            >
              {outDir ? (outDir.split(/[\\/]/).filter(Boolean).pop() ?? outDir) : 'Folder'}
            </span>
          </button>
        </div>

        {mode === 'media' ? (
          <div className="flex items-center overflow-hidden rounded-lg bg-surface">
            <div className="flex flex-1 items-center gap-2.5 px-3 py-2">
              <Toggle checked={audioEnabled} onChange={setAudioEnabled} />
              <span className="w-8 shrink-0 text-xs text-text-secondary">Audio</span>
              <select
                value={audioFormat}
                onChange={(e) => setAudioFormat(e.target.value as 'mp3' | 'ogg')}
                disabled={!audioEnabled}
                className="min-w-0 flex-1 rounded-md bg-surface-dark px-2 py-1 text-xs text-text-secondary outline-none disabled:opacity-40"
              >
                <option value="mp3">MP3 (auto, max 192k)</option>
                <option value="ogg">OGG (auto, max 208k)</option>
              </select>
            </div>
            <div className="w-px self-stretch bg-border-subtle" />
            <div className="flex flex-1 items-center gap-2.5 px-3 py-2">
              <Toggle checked={videoEnabled} onChange={setVideoEnabled} />
              <span className="w-8 shrink-0 text-xs text-text-secondary">Video</span>
              <select
                value={videoMode}
                onChange={(e) => setVideoMode(e.target.value as 'normal' | 'taiko')}
                disabled={!videoEnabled}
                className="min-w-0 flex-1 rounded-md bg-surface-dark px-2 py-1 text-xs text-text-secondary outline-none disabled:opacity-40"
              >
                <option value="normal">Normal</option>
                <option value="taiko">Taiko</option>
              </select>
            </div>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg bg-surface px-3 py-2">
            <Toggle checked={useWaifu2x} onChange={setUseWaifu2x} />
            <span className="text-xs text-text-secondary">Waifu2x upscale</span>
          </label>
        )}

        <div className="flex items-center justify-end gap-2 pt-0.5">
          {connectionError && (
            <span className="text-xs text-red-400">Could not connect to server.</span>
          )}
          {busy ? (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 rounded-lg bg-red-500/15 px-5 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/25"
            >
              <IconPlayerStop size={13} />
              Stop
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={!canStart}
              className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {mode === 'media' ? (
                <>
                  <IconDownload size={13} />
                  Download
                </>
              ) : (
                <>
                  <IconPlayerPlay size={13} />
                  Process
                </>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-border-subtle">
        {mode === 'image' && (
          <div className="flex shrink-0 gap-0.5 border-b border-border-subtle bg-surface-dark px-3 py-1.5">
            {(['log', 'preview'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setImageTab(tab)}
                className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  imageTab === tab
                    ? 'bg-surface-raised text-text-primary'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        )}

        {mode === 'media' || imageTab === 'log' ? (
          <div ref={logRef} className="flex-1 select-text overflow-y-auto p-3 font-mono">
            {log.length === 0 ? (
              <p className="text-xs text-text-muted">Ready.</p>
            ) : (
              log.map((entry, i) => (
                <div key={i} className="break-all text-xs leading-5">
                  <span className={tagColor(entry.tag)}>{entry.tag}</span>{' '}
                  <span className="text-text-secondary">{entry.message}</span>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center overflow-hidden p-6">
            {previewUrl ? (
              <img
                src={previewUrl}
                className="max-h-full max-w-full rounded-lg object-contain shadow-xl"
                alt="thumbnail preview"
              />
            ) : (
              <p className="text-xs text-text-muted">No preview yet</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
