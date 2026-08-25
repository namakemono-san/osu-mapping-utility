import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { IconPhoto, IconSettings } from '@tabler/icons-react'
import { DiffPills } from '../components/beatmapset/DiffPills'
import { BeatmapsetHeader } from '../components/beatmapset/BeatmapsetHeader'
import { EmptyState } from '../components/EmptyState'
import { useBeatmapsetRevision } from '../hooks/useBeatmapsetRevision'
import {
  applyMetadata,
  getBeatmapsetMetadata,
  type Beatmapset,
  type DiffBackground,
  type DiffMetadata,
  type MetadataUpdate
} from '../services'
import {
  applyMetadataFieldChange,
  asciiOnly,
  EMPTY_METADATA_FIELDS,
  isRomanisedFieldDisabled,
  METADATA_FIELDS,
  type MetadataFieldKey,
  type MetadataFields
} from '../utils/metadataFields'

type MetadataEditorProps = {
  beatmapset?: Beatmapset | null
}

type BgField = { file: string; offsetX: number; offsetY: number }

const EMPTY_BG: BgField = { file: '', offsetX: 0, offsetY: 0 }

function mostCommon(values: string[]): string {
  if (values.length === 0) return ''
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

function uniqueValues(diffs: DiffMetadata[], key: MetadataFieldKey): string[] {
  return [...new Set(diffs.map((d) => d[key]))]
}

function toFields(diffs: DiffMetadata[]): MetadataFields {
  const artistUnicode = mostCommon(diffs.map((d) => d.artistUnicode))
  const titleUnicode = mostCommon(diffs.map((d) => d.titleUnicode))
  const artist = mostCommon(diffs.map((d) => d.artist))
  const title = mostCommon(diffs.map((d) => d.title))
  return {
    artistUnicode,
    artist: artist || asciiOnly(artistUnicode),
    titleUnicode,
    title: title || asciiOnly(titleUnicode),
    source: mostCommon(diffs.map((d) => d.source)),
    tags: mostCommon(diffs.map((d) => d.tags))
  }
}

function toBgFields(diffs: DiffMetadata[]): Record<string, BgField> {
  const result: Record<string, BgField> = {}
  for (const d of diffs) {
    result[d.version] = {
      file: d.backgroundFile,
      offsetX: d.backgroundOffsetX,
      offsetY: d.backgroundOffsetY
    }
  }
  return result
}

function bgOffsetConflicts(diffs: DiffMetadata[], bgFields: Record<string, BgField>): Set<string> {
  const byFile: Record<string, { version: string; offsetX: number; offsetY: number }[]> = {}
  for (const d of diffs) {
    const bg = bgFields[d.version]
    if (!bg?.file) continue
    ;(byFile[bg.file] ??= []).push({ version: d.version, offsetX: bg.offsetX, offsetY: bg.offsetY })
  }
  const conflicts = new Set<string>()
  for (const entries of Object.values(byFile)) {
    if (entries.length < 2) continue
    const { offsetX, offsetY } = entries[0]
    if (entries.some((e) => e.offsetX !== offsetX || e.offsetY !== offsetY)) {
      for (const e of entries) conflicts.add(e.version)
    }
  }
  return conflicts
}

export function MetadataEditor({ beatmapset }: MetadataEditorProps): React.JSX.Element {
  const [diffs, setDiffs] = useState<DiffMetadata[]>([])
  const [loading, setLoading] = useState(false)
  const [fields, setFields] = useState<MetadataFields>(EMPTY_METADATA_FIELDS)
  const [bgFields, setBgFields] = useState<Record<string, BgField>>({})
  const [applying, setApplying] = useState(false)

  const dirtyRef = useRef(false)
  const folderPath = beatmapset?.folderPath
  const revision = useBeatmapsetRevision(folderPath)

  const loadData = useCallback(
    (path: string, isCancelled: () => boolean = () => false): Promise<void> =>
      getBeatmapsetMetadata(path).then((data) => {
        if (isCancelled()) return
        setDiffs(data)
        setFields(toFields(data))
        setBgFields(toBgFields(data))
        dirtyRef.current = false
      }),
    []
  )

  useEffect(() => {
    setDiffs([])
    setFields(EMPTY_METADATA_FIELDS)
    setBgFields({})
    dirtyRef.current = false
    if (!folderPath) return

    let cancelled = false
    setLoading(true)
    loadData(folderPath, () => cancelled)
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [folderPath, loadData])

  useEffect(() => {
    if (!folderPath || revision === 0 || dirtyRef.current) return
    let cancelled = false
    loadData(folderPath, () => cancelled).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [folderPath, revision, loadData])

  useEffect(() => {
    return window.api.bgSetter.onSaved((raw) => {
      try {
        const bg = JSON.parse(raw) as DiffBackground
        setBgFields((prev) => ({
          ...prev,
          [bg.version]: { file: bg.filename, offsetX: bg.offsetX, offsetY: bg.offsetY }
        }))
      } catch (e) {
        console.error('Failed to parse saved background data:', e)
      }
    })
  }, [])

  if (!beatmapset) return <EmptyState icon={IconSettings} message="Select a beatmapset" />

  const handleFieldChange = (key: MetadataFieldKey, value: string): void => {
    dirtyRef.current = true
    setFields((prev) => applyMetadataFieldChange(prev, key, value))
  }

  const pickConflictValue = (key: MetadataFieldKey, value: string): void => {
    dirtyRef.current = true
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  const openBgSetter = (version: string): void => {
    window.api.bgSetter.open(
      JSON.stringify({
        folderPath: beatmapset.folderPath,
        version,
        diffs: diffs.map((d) => ({
          version: d.version,
          file: bgFields[d.version]?.file ?? d.backgroundFile,
          offsetX: bgFields[d.version]?.offsetX ?? d.backgroundOffsetX,
          offsetY: bgFields[d.version]?.offsetY ?? d.backgroundOffsetY
        }))
      })
    )
  }

  const handleApply = (): void => {
    setApplying(true)
    const backgrounds: DiffBackground[] = diffs.map((d) => ({
      version: d.version,
      filename: bgFields[d.version]?.file ?? '',
      offsetX: bgFields[d.version]?.offsetX ?? 0,
      offsetY: bgFields[d.version]?.offsetY ?? 0
    }))
    const update: MetadataUpdate = { ...fields, backgrounds }
    const promise = applyMetadata(
      beatmapset.folderPath,
      diffs.map((d) => d.version),
      update
    )
      .then(() => loadData(beatmapset.folderPath))
      .finally(() => setApplying(false))
    toast.promise(promise, {
      loading: 'Applying metadata...',
      success: 'Metadata applied!',
      error: (e: Error) => e.message
    })
  }

  const conflictingBgVersions = bgOffsetConflicts(diffs, bgFields)

  return (
    <div className="flex h-full flex-col">
      <BeatmapsetHeader beatmapset={beatmapset}>
        {loading ? (
          <span className="px-2 py-1 text-xs text-white/40">Loading...</span>
        ) : diffs.length === 0 ? (
          <span className="px-2 py-1 text-xs text-white/40">No difficulties</span>
        ) : (
          <DiffPills diffs={diffs} variant="overlay" />
        )}
      </BeatmapsetHeader>

      <div className="flex-1 overflow-y-auto bg-surface">
        <div className="space-y-1 p-4">
          {METADATA_FIELDS.map(({ key, label, textarea }) => {
            const values = uniqueValues(diffs, key)
            const hasConflict = values.length > 1
            const disabled = isRomanisedFieldDisabled(fields, key)
            const conflictPicker = (
              <div className={`mt-1.5 flex flex-wrap gap-1 ${textarea ? '' : 'pl-35'}`}>
                {values.map((v) => (
                  <button
                    key={v}
                    onClick={() => pickConflictValue(key, v)}
                    className={`max-w-xs truncate rounded px-2 py-0.5 text-[11px] transition-colors ${
                      fields[key] === v
                        ? 'bg-primary/20 text-primary'
                        : 'bg-surface-raised text-text-secondary hover:opacity-80'
                    }`}
                  >
                    {v || '(empty)'}
                  </button>
                ))}
              </div>
            )
            return (
              <div
                key={key}
                className={`rounded-lg bg-surface-dark px-3 py-2.5 ${disabled ? 'opacity-50' : ''}`}
              >
                {textarea ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-text-muted">{label}</span>
                      {hasConflict && (
                        <span className="shrink-0 rounded-full bg-yellow-500/20 px-1.5 py-0.5 text-[10px] text-yellow-400">
                          conflict
                        </span>
                      )}
                    </div>
                    <textarea
                      rows={3}
                      value={fields[key]}
                      onChange={(e) => handleFieldChange(key, e.target.value)}
                      spellCheck={false}
                      className="mt-1.5 w-full resize-y bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                      placeholder="space-separated tags"
                    />
                    {hasConflict && conflictPicker}
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="w-32 shrink-0 text-xs text-text-muted">{label}</span>
                      <input
                        type="text"
                        value={fields[key]}
                        onChange={(e) => handleFieldChange(key, e.target.value)}
                        disabled={disabled}
                        className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted disabled:cursor-default"
                      />
                      {disabled ? (
                        <span className="shrink-0 text-[10px] text-text-muted/50">auto</span>
                      ) : hasConflict ? (
                        <span className="shrink-0 rounded-full bg-yellow-500/20 px-1.5 py-0.5 text-[10px] text-yellow-400">
                          conflict
                        </span>
                      ) : null}
                    </div>
                    {!disabled && hasConflict && conflictPicker}
                  </>
                )}
              </div>
            )
          })}
        </div>

        {diffs.length > 0 && (
          <div className="px-4 pb-4">
            <div className="mb-2 flex items-center gap-1.5 px-1">
              <IconPhoto size={12} className="text-text-muted" />
              <span className="text-xs text-text-muted">Background</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {diffs.map((d) => {
                const bg = bgFields[d.version] ?? EMPTY_BG
                const hasConflict = conflictingBgVersions.has(d.version)
                return (
                  <button
                    key={d.version}
                    onClick={() => openBgSetter(d.version)}
                    className="rounded-lg bg-surface-dark px-3 py-2.5 text-left transition-colors hover:bg-surface-raised"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-xs font-medium text-text-secondary">
                        {d.version}
                      </span>
                      {hasConflict && (
                        <span className="shrink-0 rounded-full bg-yellow-500/20 px-1.5 py-0.5 text-[10px] text-yellow-400">
                          conflict
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-between gap-2 text-[10px] text-text-muted">
                      <span className="truncate">{bg.file || '(no file)'}</span>
                      <span className="shrink-0 tabular-nums opacity-60">
                        ({bg.offsetX}, {bg.offsetY})
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border-subtle bg-surface px-4 py-3">
        <div className="flex items-center justify-end">
          <button
            disabled={diffs.length === 0 || applying}
            onClick={handleApply}
            className="rounded-lg bg-primary px-8 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {applying ? 'Applying...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}
