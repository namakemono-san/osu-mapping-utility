import { useEffect, useState } from 'react'
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconDownload,
  IconHeadphones,
  IconInfoCircle
} from '@tabler/icons-react'
import { BeatmapsetHeader } from '../components/beatmapset/BeatmapsetHeader'
import { DiffPills } from '../components/beatmapset/DiffPills'
import { EmptyState } from '../components/EmptyState'
import { analyzeAudio, getSpectrogram, type AudioGroup, type Beatmapset } from '../services'

type AudioInspectorProps = {
  beatmapset: Beatmapset | null
}

function formatHz(hz: number | null): string {
  if (hz == null) return '—'
  if (hz >= 1000) return `${(hz / 1000).toFixed(1)} kHz`
  return `${Math.round(hz)} Hz`
}

function formatKbps(kbps: number): string {
  return kbps > 0 ? `${Math.round(kbps)} kbps` : '—'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function IssueIcon({ severity }: { severity: string }): React.JSX.Element {
  if (severity === 'problem')
    return <IconAlertTriangle size={13} stroke={1.5} className="mt-0.5 shrink-0 text-red-400" />
  if (severity === 'warning')
    return <IconInfoCircle size={13} stroke={1.5} className="mt-0.5 shrink-0 text-yellow-400" />
  return <IconCircleCheck size={13} stroke={1.5} className="mt-0.5 shrink-0 text-green-400" />
}

function SpectrogramView({
  folderPath,
  group
}: {
  folderPath: string
  group: AudioGroup
}): React.JSX.Element {
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { audioFilename, cutoffHz } = group

  useEffect(() => {
    let cancelled = false
    setSrc(null)
    setError(null)
    setLoading(true)

    getSpectrogram(folderPath, audioFilename, cutoffHz ?? 0)
      .then((b64) => {
        if (cancelled) return
        setSrc(`data:image/png;base64,${b64}`)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to generate spectrogram.')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [folderPath, audioFilename, cutoffHz])

  const handleDownload = (): void => {
    if (!src) return
    const a = document.createElement('a')
    a.href = src
    a.download = `${group.audioFilename.replace(/\.[^.]+$/, '')}_spectrogram.png`
    a.click()
  }

  return (
    <div className="relative h-full w-full bg-black">
      {loading && (
        <div className="flex h-full items-center justify-center text-sm text-text-muted">
          Generating spectrogram…
        </div>
      )}
      {error && (
        <div className="flex h-full items-center justify-center text-sm text-red-400">{error}</div>
      )}
      {src && (
        <>
          <img src={src} alt="spectrogram" className="h-full w-full object-contain" />
          <button
            onClick={handleDownload}
            className="absolute bottom-2 right-2 rounded bg-black/60 p-1.5 text-white hover:bg-black/80"
            title="Download PNG"
          >
            <IconDownload size={14} stroke={1.5} />
          </button>
        </>
      )}
    </div>
  )
}

function SidebarTab({
  group,
  active,
  onClick
}: {
  group: AudioGroup
  active: boolean
  onClick: () => void
}): React.JSX.Element {
  const hasProblems = group.issues.some((i) => i.severity === 'problem')
  const hasWarnings = group.issues.some((i) => i.severity === 'warning')

  return (
    <button
      onClick={onClick}
      className={`w-full border-b border-border-subtle px-3 py-2.5 text-left transition-colors ${
        active ? 'bg-surface-dark' : 'hover:bg-surface-dark'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className="truncate font-mono text-xs text-text-primary">{group.audioFilename}</span>
        {hasProblems && (
          <span className="shrink-0 rounded-full bg-red-500/20 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-red-400">
            Problem
          </span>
        )}
        {!hasProblems && hasWarnings && (
          <span className="shrink-0 rounded-full bg-yellow-500/20 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-yellow-400">
            Warning
          </span>
        )}
        {!hasProblems && !hasWarnings && (
          <span className="shrink-0 rounded-full bg-green-500/20 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-green-400">
            OK
          </span>
        )}
      </div>
      <div className="mt-0.5 truncate text-[11px] text-text-muted">
        {group.usedByDifficulties.join(', ')}
      </div>
    </button>
  )
}

export function AudioInspector({ beatmapset }: AudioInspectorProps): React.JSX.Element {
  const [groups, setGroups] = useState<AudioGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState(0)

  const folderPath = beatmapset?.folderPath

  useEffect(() => {
    if (!folderPath) return

    let cancelled = false
    setGroups([])
    setError(null)
    setLoading(true)
    setSelected(0)

    analyzeAudio(folderPath)
      .then((result) => {
        if (cancelled) return
        setGroups(result)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Analysis failed.')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [folderPath])

  if (!beatmapset) return <EmptyState icon={IconHeadphones} message="Select a beatmapset" />

  const activeGroup = groups[selected] ?? null

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface">
      <BeatmapsetHeader beatmapset={beatmapset}>
        <DiffPills diffs={beatmapset.difficulties} variant="overlay" />
      </BeatmapsetHeader>

      {loading && (
        <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
          Analyzing audio…
        </div>
      )}
      {error && (
        <div className="flex flex-1 items-center justify-center text-sm text-red-400">{error}</div>
      )}

      {!loading && !error && (
        <div className="flex min-h-0 flex-1">
          <div className="flex w-52 shrink-0 flex-col overflow-y-auto border-r border-border-subtle bg-surface">
            {groups.length === 0 && (
              <div className="p-4 text-xs text-text-muted">No audio files found.</div>
            )}
            {groups.map((g, i) => (
              <SidebarTab
                key={g.audioFilename}
                group={g}
                active={i === selected}
                onClick={() => setSelected(i)}
              />
            ))}

            {activeGroup && (
              <>
                <div className="grid grid-cols-2 gap-px border-b border-t border-border-subtle bg-border-subtle">
                  {[
                    ['Format', activeGroup.format || '—'],
                    ['Bitrate', formatKbps(activeGroup.bitrateKbps)],
                    [
                      'Sample rate',
                      activeGroup.sampleRate > 0 ? `${activeGroup.sampleRate} Hz` : '—'
                    ],
                    ['Duration', formatDuration(activeGroup.durationMs)],
                    ['File size', formatBytes(activeGroup.fileSizeBytes)],
                    ['Cutoff', formatHz(activeGroup.cutoffHz)]
                  ].map(([label, value]) => (
                    <div key={label} className="bg-surface px-3 py-2">
                      <div className="text-[10px] text-text-muted">{label}</div>
                      <div className="mt-px text-xs font-medium text-text-primary">{value}</div>
                    </div>
                  ))}
                </div>

                {activeGroup.issues.length > 0 && (
                  <div className="px-3 py-2.5">
                    <div className="space-y-1.5">
                      {activeGroup.issues.map((issue, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-1.5 text-[11px] leading-snug text-text-secondary"
                        >
                          <IssueIcon severity={issue.severity} />
                          {issue.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="min-w-0 flex-1">
            {activeGroup &&
            !activeGroup.issues.some(
              (i) => i.severity === 'problem' && i.message.startsWith('Audio file not found')
            ) ? (
              <SpectrogramView folderPath={beatmapset.folderPath} group={activeGroup} />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-text-muted">
                {activeGroup ? 'Audio file not found.' : 'No audio selected.'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
