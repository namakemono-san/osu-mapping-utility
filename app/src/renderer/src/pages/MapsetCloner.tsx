import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { IconCopy } from '@tabler/icons-react'
import { DiffPills } from '../components/beatmapset/DiffPills'
import { GameModeIcon } from '../components/icons/GameModeIcon'
import { BeatmapsetHeader } from '../components/beatmapset/BeatmapsetHeader'
import { cloneBeatmap, getBeatmapsetMetadata, type Beatmapset } from '../utils/signalr'
import {
  applyMetadataFieldChange,
  EMPTY_METADATA_FIELDS,
  isRomanisedFieldDisabled,
  METADATA_FIELDS,
  type MetadataFieldKey,
  type MetadataFields
} from '../utils/metadataFields'

interface MapsetClonerProps {
  beatmapset: Beatmapset | null
}

const GAME_MODES = ['Standard', 'Taiko', 'Catch', 'Mania'] as const

type OptionKey = 'resetTimingPoints' | 'resetDifficulty' | 'copyPreviewTime'

const OPTIONS: { key: OptionKey; label: string; desc: string }[] = [
  {
    key: 'resetTimingPoints',
    label: 'Reset Volume / Samples / Kiai',
    desc: 'Reset volume, sample sets and kiai flags on timing points'
  },
  {
    key: 'resetDifficulty',
    label: 'Reset Difficulty',
    desc: 'HP 5 / CS 5 / OD 5 / AR 5 / SV 1.4 / Tick 1'
  },
  {
    key: 'copyPreviewTime',
    label: 'Copy Preview Time',
    desc: 'Keep the preview time from the source difficulty'
  }
]

export function MapsetCloner({ beatmapset }: MapsetClonerProps): React.JSX.Element {
  const [templateVersion, setTemplateVersion] = useState('')
  const [gameMode, setGameMode] = useState(1)
  const [meta, setMeta] = useState<MetadataFields>(EMPTY_METADATA_FIELDS)
  const [options, setOptions] = useState<Record<OptionKey, boolean>>({
    resetTimingPoints: true,
    resetDifficulty: true,
    copyPreviewTime: true
  })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!beatmapset) return
    let cancelled = false
    const firstDiff = beatmapset.difficulties.at(-1)
    setTemplateVersion(firstDiff?.version ?? '')
    setGameMode(1)
    getBeatmapsetMetadata(beatmapset.folderPath)
      .then((diffs) => {
        if (cancelled) return
        const d = diffs[0]
        if (!d) return
        setMeta({
          artistUnicode: d.artistUnicode,
          artist: d.artist,
          titleUnicode: d.titleUnicode,
          title: d.title,
          source: d.source,
          tags: d.tags
        })
      })
      .catch(() => {
        if (cancelled) return
        setMeta({
          artistUnicode: beatmapset.artist,
          artist: beatmapset.artist,
          titleUnicode: beatmapset.title,
          title: beatmapset.title,
          source: '',
          tags: ''
        })
      })
    return () => {
      cancelled = true
    }
  }, [beatmapset])

  const handleFieldChange = (key: MetadataFieldKey, value: string): void => {
    setMeta((prev) => applyMetadataFieldChange(prev, key, value))
  }

  const toggleOption = useCallback((key: OptionKey) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const handleClone = useCallback(async () => {
    if (!beatmapset || !templateVersion || busy) return
    setBusy(true)
    try {
      const oszPath = await cloneBeatmap({
        folderPath: beatmapset.folderPath,
        templateVersion,
        gameMode,
        ...meta,
        ...options,
        removeSkinFiles: true
      })
      void window.api.shell.openPath(oszPath)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [beatmapset, templateVersion, gameMode, meta, options, busy])

  if (!beatmapset) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-text-muted">
          <IconCopy size={36} stroke={1} className="opacity-30" />
          <p className="text-sm">Select a beatmapset</p>
        </div>
      </div>
    )
  }

  const modeSelector = (
    <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-[hsl(200deg_10%_10%/50%)] p-1">
      {GAME_MODES.map((name, idx) => (
        <button
          key={idx}
          onClick={() => setGameMode(idx)}
          className={`rounded-md p-2 leading-0 transition-colors ${gameMode === idx ? 'bg-surface-raised' : 'hover:bg-white/5'}`}
        >
          <GameModeIcon mode={name} size={24} color="white" />
        </button>
      ))}
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      <BeatmapsetHeader beatmapset={beatmapset} action={modeSelector}>
        {beatmapset.difficulties.length === 0 ? (
          <span className="px-2 py-1 text-xs text-white/40">No difficulties</span>
        ) : (
          <DiffPills
            diffs={beatmapset.difficulties}
            activeVersion={templateVersion}
            onSelect={setTemplateVersion}
            variant="overlay"
          />
        )}
      </BeatmapsetHeader>

      <div className="flex-1 overflow-y-auto bg-surface">
        <div className="space-y-1 p-4">
          {METADATA_FIELDS.map(({ key, label, textarea }) => {
            const disabled = isRomanisedFieldDisabled(meta, key)
            return (
              <div
                key={key}
                className={`rounded-lg bg-surface-dark px-3 py-2.5 ${disabled ? 'opacity-50' : ''}`}
              >
                {textarea ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-text-muted">{label}</span>
                    </div>
                    <textarea
                      rows={3}
                      value={meta[key]}
                      onChange={(e) => handleFieldChange(key, e.target.value)}
                      spellCheck={false}
                      className="mt-1.5 w-full resize-y bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                      placeholder="space-separated tags"
                    />
                  </>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="w-32 shrink-0 text-xs text-text-muted">{label}</span>
                    <input
                      type="text"
                      value={meta[key]}
                      onChange={(e) => handleFieldChange(key, e.target.value)}
                      disabled={disabled}
                      className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted disabled:cursor-default"
                    />
                    {disabled && (
                      <span className="shrink-0 text-[10px] text-text-muted/50">auto</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 px-4 pb-4 lg:grid-cols-3">
          {OPTIONS.map(({ key, label, desc }) => {
            const active = options[key]
            return (
              <button
                key={key}
                onClick={() => toggleOption(key)}
                className={`flex flex-col gap-1.5 rounded-xl border px-4 py-3 text-left transition-all ${
                  active
                    ? 'border-primary/40 bg-primary/10 ring-1 ring-primary/20'
                    : 'border-border-subtle bg-surface-dark hover:border-border hover:bg-surface-raised'
                }`}
              >
                <span
                  className={`text-sm font-medium ${active ? 'text-text-primary' : 'text-text-secondary'}`}
                >
                  {label}
                </span>
                <span className="text-xs text-text-muted">{desc}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="shrink-0 border-t border-border-subtle bg-surface px-4 py-3">
        <div className="flex items-center justify-end">
          <button
            onClick={handleClone}
            disabled={busy || !templateVersion}
            className="rounded-lg bg-primary px-8 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {busy ? 'Cloning…' : 'Clone'}
          </button>
        </div>
      </div>
    </div>
  )
}
