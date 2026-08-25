import {
  IconAdjustments,
  IconAlignCenter,
  IconArrowsExchange,
  IconBookmarkOff,
  IconCheck,
  IconCircleMinus,
  IconCirclePlus,
  IconSquare,
  IconSquareCheckFilled,
  IconSquareMinus,
  IconTarget,
  IconVolumeOff
} from '@tabler/icons-react'
import { DiffPills } from '../components/beatmapset/DiffPills'
import { BeatmapsetHeader } from '../components/beatmapset/BeatmapsetHeader'
import { EmptyState } from '../components/EmptyState'
import { useState } from 'react'
import { toast } from 'sonner'
import { applyTransforms } from '../services'
import type { Beatmapset } from '../services'
import { GameModeIcon } from '../components/icons/GameModeIcon'
import { useLocalStorage, type Codec } from '../utils/useLocalStorage'

const enabledTransformsCodec: Codec<Set<string>> = {
  serialize: (value) => JSON.stringify([...value]),
  deserialize: (raw) => new Set(JSON.parse(raw) as string[])
}

type Transform = {
  id: string
  icon: React.ReactNode
  label: string
  desc: string
  modes?: number[]
}

const TRANSFORMS: Transform[] = [
  {
    id: 'center',
    icon: <IconAlignCenter size={16} stroke={1.5} />,
    label: 'Center',
    desc: 'Move all objects to center (256, 192)',
    modes: [1]
  },
  {
    id: 'rm_bookmarks',
    icon: <IconBookmarkOff size={16} stroke={1.5} />,
    label: 'Remove Bookmarks',
    desc: 'Remove all editor bookmarks'
  },
  {
    id: 'rm_new_combo',
    icon: <IconCircleMinus size={16} stroke={1.5} />,
    label: 'Remove New Combos',
    desc: 'Remove all combo resets except first',
    modes: [1, 2, 3]
  },
  {
    id: 'whistle_to_clap',
    icon: <IconArrowsExchange size={16} stroke={1.5} />,
    label: 'Whistle to Clap',
    desc: 'Convert whistle hitsounds to clap',
    modes: [1]
  },
  {
    id: 'fix_unsnaps',
    icon: <IconTarget size={16} stroke={1.5} />,
    label: 'Fix Unsnaps',
    desc: 'Snap all unsnapped objects to grid'
  },
  {
    id: 'add_new_combo',
    icon: <IconCirclePlus size={16} stroke={1.5} />,
    label: 'Add New Combos',
    desc: 'Add new combo to every object',
    modes: [1]
  },
  {
    id: 'reset_hit_samples',
    icon: <IconVolumeOff size={16} stroke={1.5} />,
    label: 'Reset Hit Samples',
    desc: 'Reset all sample sets and custom samples to default',
    modes: [1]
  }
]

type MapsetTweakerProps = {
  beatmapset?: Beatmapset | null
}

export function MapsetTweaker({ beatmapset }: MapsetTweakerProps): React.JSX.Element {
  const [enabledTransforms, setEnabledTransforms] = useLocalStorage(
    'tweaker:enabled-transforms',
    new Set<string>(),
    enabledTransformsCodec
  )
  const [selectedDiffs, setSelectedDiffs] = useState<Set<string>>(
    () => new Set((beatmapset?.difficulties ?? []).map((d) => d.version))
  )
  const [selectedMode, setSelectedMode] = useState<number>(
    () => [...new Set((beatmapset?.difficulties ?? []).map((d) => d.mode))][0] ?? 0
  )
  const [trackedKey, setTrackedKey] = useState<string | null>(null)
  const [backup, setBackup] = useState(true)
  const [applying, setApplying] = useState(false)

  const diffs = beatmapset?.difficulties ?? []
  const presentModes = [...new Set(diffs.map((d) => d.mode))]

  const folderPath = beatmapset?.folderPath ?? ''
  const diffKey = `${folderPath}|${JSON.stringify(diffs.map((d) => d.version))}`

  if (trackedKey !== diffKey) {
    const folderChanged = trackedKey === null || !trackedKey.startsWith(`${folderPath}|`)
    setTrackedKey(diffKey)
    setSelectedDiffs((prev) =>
      folderChanged
        ? new Set(diffs.map((d) => d.version))
        : new Set(diffs.map((d) => d.version).filter((v) => prev.has(v)))
    )
    if (folderChanged || !presentModes.includes(selectedMode)) setSelectedMode(presentModes[0] ?? 0)
  }

  const visibleDiffs = diffs.filter((d) => d.mode === selectedMode)

  const toggleTransform = (id: string): void => {
    setEnabledTransforms((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleDiff = (version: string): void => {
    setSelectedDiffs((prev) => {
      const next = new Set(prev)
      if (next.has(version)) next.delete(version)
      else next.add(version)
      return next
    })
  }

  const canApply = enabledTransforms.size > 0 && selectedDiffs.size > 0

  if (!beatmapset) return <EmptyState icon={IconAdjustments} message="Select a beatmapset" />

  const modeSelector =
    presentModes.length > 0 ? (
      <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-[hsl(200deg_10%_10%/50%)] p-1">
        {presentModes.map((mode) => (
          <button
            key={mode}
            onClick={
              presentModes.length > 1
                ? () => {
                    setSelectedMode(mode)
                    const visibleIds = new Set(
                      TRANSFORMS.filter((t) => !t.modes || t.modes.includes(mode)).map((t) => t.id)
                    )
                    setEnabledTransforms(
                      (prev) => new Set([...prev].filter((id) => visibleIds.has(id)))
                    )
                  }
                : undefined
            }
            disabled={presentModes.length === 1}
            className={`rounded-md p-2 leading-0 transition-colors ${
              selectedMode === mode
                ? 'bg-surface-raised'
                : presentModes.length > 1
                  ? 'hover:bg-white/5'
                  : ''
            }`}
          >
            <GameModeIcon
              mode={(['Standard', 'Taiko', 'Catch', 'Mania'] as const)[mode] ?? 'Standard'}
              size={24}
              color="white"
            />
          </button>
        ))}
      </div>
    ) : undefined

  return (
    <div className="flex h-full flex-col">
      <BeatmapsetHeader beatmapset={beatmapset} action={modeSelector}>
        {visibleDiffs.length === 0 ? (
          <span className="px-2 py-1 text-xs text-white/40">No difficulties</span>
        ) : (
          <>
            {(() => {
              const visibleVersions = visibleDiffs.map((d) => d.version)
              const selectedCount = visibleVersions.filter((v) => selectedDiffs.has(v)).length
              const state =
                selectedCount === 0
                  ? 'none'
                  : selectedCount === visibleVersions.length
                    ? 'all'
                    : 'partial'
              return (
                <button
                  onClick={() => {
                    setSelectedDiffs((prev) => {
                      const next = new Set(prev)
                      if (state === 'all') visibleVersions.forEach((v) => next.delete(v))
                      else visibleVersions.forEach((v) => next.add(v))
                      return next
                    })
                  }}
                  className="rounded-md p-1.5 leading-0 text-white/40 transition-colors hover:text-white/80"
                >
                  {state === 'all' ? (
                    <IconSquareCheckFilled size={16} className="text-primary" />
                  ) : state === 'partial' ? (
                    <IconSquareMinus size={16} />
                  ) : (
                    <IconSquare size={16} />
                  )}
                </button>
              )
            })()}
            <div className="h-4 w-px bg-white/10" />
            <DiffPills
              diffs={visibleDiffs}
              selectedVersions={selectedDiffs}
              onSelect={toggleDiff}
              variant="overlay"
            />
          </>
        )}
      </BeatmapsetHeader>

      <div className="flex-1 overflow-y-auto bg-surface">
        <div className="grid grid-cols-2 gap-2 p-4 lg:grid-cols-3">
          {TRANSFORMS.filter((t) => !t.modes || t.modes.includes(selectedMode)).map(
            ({ id, icon, label, desc }) => {
              const active = enabledTransforms.has(id)
              return (
                <button
                  key={id}
                  onClick={() => toggleTransform(id)}
                  className={`flex flex-col gap-1.5 rounded-xl border px-4 py-3 text-left transition-all ${
                    active
                      ? 'border-primary/40 bg-primary/10 ring-1 ring-primary/20'
                      : 'border-border-subtle bg-surface-dark hover:border-border hover:bg-surface-raised'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={active ? 'text-primary' : 'text-text-dim'}>{icon}</span>
                    <span
                      className={`text-sm font-medium ${active ? 'text-text-primary' : 'text-text-secondary'}`}
                    >
                      {label}
                    </span>
                  </div>
                  <span className="text-xs text-text-muted">{desc}</span>
                </button>
              )
            }
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border-subtle bg-surface px-4 py-3">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setBackup(!backup)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-text-primary ${
              backup ? 'border-primary/50 bg-primary/10' : 'border-border bg-surface-dark'
            }`}
          >
            <div
              className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                backup ? 'border-primary bg-primary/30' : 'border-border'
              }`}
            >
              {backup && <IconCheck size={10} stroke={2.5} className="text-primary" />}
            </div>
            Backup
          </button>
          <button
            disabled={!canApply || applying}
            onClick={() => {
              if (!beatmapset) return
              setApplying(true)
              const promise = applyTransforms(
                beatmapset.folderPath,
                [...selectedDiffs],
                [...enabledTransforms],
                backup
              ).finally(() => setApplying(false))
              toast.promise(promise, {
                loading: 'Applying...',
                success: 'Applied!',
                error: (e: Error) => e.message
              })
            }}
            className="ml-auto rounded-lg bg-primary px-8 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {applying
              ? 'Applying...'
              : `Apply to ${selectedDiffs.size} ${selectedDiffs.size === 1 ? 'difficulty' : 'difficulties'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
