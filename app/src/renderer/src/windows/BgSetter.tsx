import { useEffect, useRef, useState } from 'react'
import { Toaster, toast } from 'sonner'
import { IconX } from '@tabler/icons-react'
import { DiffPills } from '../components/beatmapset/DiffPills'
import { applyBackgrounds, startConnection, type DiffBackground } from '../utils/signalr'

type BgData = { version: string; file: string; offsetX: number; offsetY: number }
type InitData = { folderPath: string; diffs: BgData[]; version: string }

const INITIAL_BG_Y = 128
const TAIKO_OVERLAY_HEIGHT = 258

function parseInitData(): InitData | null {
  try {
    const raw = new URLSearchParams(window.location.search).get('data')
    return raw ? (JSON.parse(decodeURIComponent(raw)) as InitData) : null
  } catch {
    return null
  }
}

export function BgSetter(): React.JSX.Element {
  const initData = parseInitData()

  const [folderPath] = useState(initData?.folderPath ?? '')
  const [diffs, setDiffs] = useState<BgData[]>(initData?.diffs ?? [])
  const [selectedVersion, setSelectedVersion] = useState(initData?.version ?? '')
  const [bgFields, setBgFields] = useState<Record<string, BgData>>(() => {
    const m: Record<string, BgData> = {}
    for (const d of initData?.diffs ?? []) m[d.version] = { ...d }
    return m
  })
  const [savedOffsets, setSavedOffsets] = useState<Record<string, BgData>>(() => {
    const m: Record<string, BgData> = {}
    for (const d of initData?.diffs ?? []) m[d.version] = { ...d }
    return m
  })
  const [containerSize, setContainerSize] = useState({ w: 854, h: 480 })
  const [isDragging, setIsDragging] = useState(false)
  const [applying, setApplying] = useState(false)
  const [imgHeights, setImgHeights] = useState<Record<string, number>>({})

  const previewRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startY: number; startOsuY: number } | null>(null)

  useEffect(() => {
    startConnection().then((ok) => {
      if (!ok) console.error('Could not connect to server.')
    })
  }, [])

  useEffect(() => {
    return window.api.bgSetter.onDataUpdate((raw) => {
      try {
        const data = JSON.parse(decodeURIComponent(raw)) as InitData
        const m: Record<string, BgData> = {}
        for (const d of data.diffs) m[d.version] = { ...d }
        setDiffs(data.diffs)
        setSelectedVersion(data.version)
        setBgFields(() => ({ ...m }))
        setSavedOffsets(() => ({ ...m }))
      } catch (e) {
        console.error('Failed to parse background-setter init data:', e)
      }
    })
  }, [])

  useEffect(() => {
    const el = previewRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setContainerSize({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      e.preventDefault()
      const step = e.shiftKey ? 10 : 1
      const dir = e.key === 'ArrowUp' ? -1 : 1
      setBgFields((prev) => {
        const cur = prev[selectedVersion] ?? {
          version: selectedVersion,
          file: '',
          offsetX: 0,
          offsetY: 0
        }
        const displayH = imgHeights[cur.file] ?? 480
        const offsetY_osu = (displayH - 480) / 2
        const minY = 480 - displayH - INITIAL_BG_Y + offsetY_osu
        const maxY = TAIKO_OVERLAY_HEIGHT - INITIAL_BG_Y + offsetY_osu
        return {
          ...prev,
          [selectedVersion]: {
            ...cur,
            offsetY: Math.max(minY, Math.min(maxY, cur.offsetY + dir * step))
          }
        }
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedVersion, imgHeights])

  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: MouseEvent): void => {
      if (!dragRef.current) return
      const deltaCss = e.clientY - dragRef.current.startY
      const deltaOsu = Math.round((deltaCss * 480) / containerSize.h)
      const newY = dragRef.current.startOsuY + deltaOsu
      setBgFields((prev) => {
        const cur = prev[selectedVersion] ?? {
          version: selectedVersion,
          file: '',
          offsetX: 0,
          offsetY: 0
        }
        const displayH = imgHeights[cur.file] ?? 480
        const offsetY_osu = (displayH - 480) / 2
        const minY = 480 - displayH - INITIAL_BG_Y + offsetY_osu
        const maxY = TAIKO_OVERLAY_HEIGHT - INITIAL_BG_Y + offsetY_osu
        return {
          ...prev,
          [selectedVersion]: { ...cur, offsetY: Math.max(minY, Math.min(maxY, newY)) }
        }
      })
    }
    const onUp = (): void => {
      setIsDragging(false)
      dragRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isDragging, containerSize.h, selectedVersion, imgHeights])

  const current = bgFields[selectedVersion] ?? {
    version: selectedVersion,
    file: '',
    offsetX: 0,
    offsetY: 0
  }
  const bgUrl = current.file ? `asset:///${folderPath.replace(/\\/g, '/')}/${current.file}` : null

  const displayH = imgHeights[current.file] ?? 480
  const offsetY_osu = (displayH - 480) / 2
  const scale = containerSize.h / 480
  const imageTop_css = (INITIAL_BG_Y + current.offsetY - offsetY_osu) * scale
  const imgH_css = displayH * scale

  const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement>): void => {
    const img = e.currentTarget
    const aspect = img.naturalHeight / img.naturalWidth
    const h = aspect < 0.5625 ? 480 : Math.round((img.naturalHeight * 854) / img.naturalWidth)
    setImgHeights((prev) => ({ ...prev, [current.file]: h }))
  }

  const updateCurrent = (patch: Partial<BgData>): void => {
    setBgFields((prev) => ({
      ...prev,
      [selectedVersion]: {
        ...(prev[selectedVersion] ?? {
          version: selectedVersion,
          file: '',
          offsetX: 0,
          offsetY: 0
        }),
        ...patch
      }
    }))
  }

  const doApply = (backgrounds: DiffBackground[]): void => {
    setApplying(true)
    const promise = applyBackgrounds(folderPath, backgrounds)
      .then(() => {
        for (const bg of backgrounds) window.api.bgSetter.save(JSON.stringify(bg))
        setSavedOffsets((prev) => {
          const next = { ...prev }
          for (const bg of backgrounds)
            next[bg.version] = {
              version: bg.version,
              file: bg.filename,
              offsetX: bg.offsetX,
              offsetY: bg.offsetY
            }
          return next
        })
      })
      .finally(() => setApplying(false))
    toast.promise(promise, {
      loading: 'Applying...',
      success: 'Saved!',
      error: (e: Error) => e.message
    })
  }

  const handleApply = (): void => {
    doApply([
      {
        version: current.version,
        filename: current.file,
        offsetX: current.offsetX,
        offsetY: current.offsetY
      }
    ])
  }

  const handleApplyToAll = (): void => {
    doApply(
      diffs.map((d) => ({
        version: d.version,
        filename: bgFields[d.version]?.file ?? d.file,
        offsetX: current.offsetX,
        offsetY: current.offsetY
      }))
    )
    setBgFields((prev) => {
      const next = { ...prev }
      for (const d of diffs) {
        next[d.version] = {
          ...(prev[d.version] ?? d),
          offsetX: current.offsetX,
          offsetY: current.offsetY
        }
      }
      return next
    })
  }

  return (
    <div className="flex h-screen flex-col bg-surface-dark">
      <Toaster position="top-center" theme="dark" richColors />

      <div
        className="drag flex shrink-0 items-center gap-1 border-b border-border-subtle px-2"
        style={{ height: 44 }}
      >
        <div className="flex flex-1 items-center gap-1 overflow-x-auto">
          <DiffPills
            diffs={diffs}
            activeVersion={selectedVersion}
            onSelect={setSelectedVersion}
            variant="surface"
          />
        </div>
        <button
          onClick={() => window.close()}
          className="no-drag ml-1 shrink-0 rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary"
        >
          <IconX size={14} />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden bg-black select-none">
        <div
          ref={previewRef}
          className="relative w-full cursor-ns-resize overflow-hidden"
          style={{ aspectRatio: '854 / 480', maxHeight: '100%' }}
          onMouseDown={(e) => {
            dragRef.current = { startY: e.clientY, startOsuY: current.offsetY }
            setIsDragging(true)
          }}
        >
          {bgUrl && (
            <img
              key={bgUrl}
              src={bgUrl}
              onLoad={handleImgLoad}
              draggable={false}
              className="pointer-events-none absolute left-0"
              style={{
                top: imageTop_css,
                width: containerSize.w,
                height: imgH_css,
                objectFit: 'cover',
                objectPosition: 'center'
              }}
            />
          )}
          <div className="pointer-events-none absolute inset-0 bg-black/30" />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 bg-black"
            style={{ height: `${(TAIKO_OVERLAY_HEIGHT / 480) * 100}%` }}
          />
          {!bgUrl && (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ top: `${(TAIKO_OVERLAY_HEIGHT / 480) * 100}%` }}
            >
              <span className="text-sm text-text-muted">No background</span>
            </div>
          )}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <span className="rounded-full bg-black/60 px-3 py-1 text-sm tabular-nums text-white/80">
              {current.offsetX}, {current.offsetY}
            </span>
          </div>
        </div>
      </div>

      <div className="no-drag shrink-0 border-t border-border-subtle bg-surface px-3 py-2.5">
        {(() => {
          const savedCurrent = savedOffsets[selectedVersion]
          const conflicting = savedCurrent?.file
            ? diffs.filter((d) => {
                const s = savedOffsets[d.version]
                return (
                  d.version !== selectedVersion &&
                  s?.file === savedCurrent.file &&
                  (s.offsetX !== savedCurrent.offsetX || s.offsetY !== savedCurrent.offsetY)
                )
              })
            : []
          return conflicting.length > 0 ? (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-yellow-400/80">conflict</span>
              {conflicting.map((d) => {
                const s = savedOffsets[d.version]!
                return (
                  <button
                    key={d.version}
                    onClick={() => updateCurrent({ offsetX: s.offsetX, offsetY: s.offsetY })}
                    className="rounded bg-surface-raised px-2 py-0.5 text-[10px] tabular-nums text-text-secondary transition-colors hover:text-text-primary"
                  >
                    {d.version} ({s.offsetX}, {s.offsetY})
                  </button>
                )
              })}
            </div>
          ) : null
        })()}
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="shrink-0 text-xs text-text-muted">File</span>
            <input
              type="text"
              value={current.file}
              onChange={(e) => updateCurrent({ file: e.target.value })}
              className="min-w-0 flex-1 rounded-md bg-surface-dark px-2 py-1.5 text-xs text-text-primary outline-none ring-1 ring-transparent focus:ring-primary"
              placeholder="bg.jpg"
            />
            <span className="shrink-0 text-xs text-text-muted">X</span>
            <input
              type="number"
              value={current.offsetX}
              onChange={(e) => updateCurrent({ offsetX: parseInt(e.target.value) || 0 })}
              className="w-16 rounded-md bg-surface-dark px-2 py-1.5 text-xs text-text-primary outline-none ring-1 ring-transparent focus:ring-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="shrink-0 text-xs text-text-muted">Y</span>
            <input
              type="number"
              value={current.offsetY}
              onChange={(e) => updateCurrent({ offsetY: parseInt(e.target.value) || 0 })}
              className="w-16 rounded-md bg-surface-dark px-2 py-1.5 text-xs text-text-primary outline-none ring-1 ring-transparent focus:ring-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
          <div className="flex shrink-0 gap-1.5">
            {diffs.length > 1 && (
              <button
                disabled={applying}
                onClick={handleApplyToAll}
                className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary disabled:opacity-40"
              >
                Apply to all
              </button>
            )}
            <button
              disabled={applying}
              onClick={handleApply}
              className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
