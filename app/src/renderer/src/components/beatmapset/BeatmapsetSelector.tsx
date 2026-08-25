import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { IconDeviceDesktop, IconMusic, IconRefresh, IconSearch, IconX } from '@tabler/icons-react'
import {
  startConnection,
  scanBeatmapsets,
  fetchBeatmapsets,
  getCurrentBeatmap,
  searchBeatmapsets,
  onBeatmapsetsListChanged,
  onBeatmapsetChanged,
  type Beatmapset,
  type CurrentBeatmapResult
} from '../../services'
import { samePath } from '../../utils/paths'
import { BeatmapCard, PlaceholderCard, ITEM_HEIGHT, GAP } from './BeatmapCard'
import { BeatmapContextMenu } from './BeatmapContextMenu'

const PADDING = 8
const BUFFER = 3
const PAGE_SIZE = 100
const SEARCH_DEBOUNCE_MS = 150
const CURRENT_BEATMAP_POLL_MS = 2000

type ConnectionState = 'connecting' | 'connected' | 'error'

type LoadOptions = {
  forceRefresh?: boolean
  keepScroll?: boolean
  overridePath?: string
}

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  beatmap: Beatmapset | null
}

interface BeatmapsetSelectorProps {
  onSelect?: (beatmap: Beatmapset) => void
  selectedPath?: string | null
  songsPath?: string | null
}

export function BeatmapsetSelector({
  onSelect,
  selectedPath = null,
  songsPath = null
}: BeatmapsetSelectorProps): React.JSX.Element {
  const [totalCount, setTotalCount] = useState(0)
  const [loadedData, setLoadedData] = useState<Map<number, Beatmapset>>(new Map())
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')
  const [scanError, setScanError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(600)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    beatmap: null
  })
  const [searchResults, setSearchResults] = useState<Beatmapset[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [currentBeatmap, setCurrentBeatmap] = useState<CurrentBeatmapResult | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const targetIndexRef = useRef(0)
  const loadedPages = useRef<Set<number>>(new Set())
  const loadingPages = useRef<Set<number>>(new Set())
  const searchAbort = useRef<AbortController | null>(null)
  const initialMount = useRef(true)
  const isRefreshingRef = useRef(false)

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => setContainerHeight(entry.contentRect.height))
    observer.observe(container)
    setContainerHeight(container.clientHeight)
    return () => observer.disconnect()
  }, [])

  const scrollToTop = useCallback(() => {
    targetIndexRef.current = 0
    scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [])

  const loadBeatmapsets = useCallback(
    async ({ forceRefresh = false, keepScroll = false, overridePath }: LoadOptions = {}) => {
      isRefreshingRef.current = true
      setIsRefreshing(true)
      setTotalCount(0)
      setLoadedData(new Map())
      setScanError(null)
      loadedPages.current.clear()
      loadingPages.current.clear()
      if (!keepScroll) scrollToTop()

      await scanBeatmapsets(
        (count) => setTotalCount(count),
        (items) => {
          loadedPages.current.add(0)
          setLoadedData((prev) => {
            const next = new Map(prev)
            items.forEach((item, i) => next.set(i, item))
            return next
          })
        },
        overridePath ?? songsPath ?? undefined,
        forceRefresh
      ).catch((e: unknown) => {
        setScanError(e instanceof Error ? e.message : 'Failed to scan beatmapsets.')
      })

      isRefreshingRef.current = false
      setIsRefreshing(false)
    },
    [scrollToTop, songsPath]
  )

  useEffect(() => {
    let cancelled = false
    startConnection().then((ok) => {
      if (cancelled) return
      if (ok) {
        setConnectionState('connected')
        loadBeatmapsets()
      } else {
        setConnectionState('error')
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (connectionState !== 'connected') return
    let cancelled = false

    const poll = (): void => {
      getCurrentBeatmap()
        .then((result) => {
          if (!cancelled) setCurrentBeatmap(result)
        })
        .catch(() => {})
    }

    poll()
    const id = setInterval(poll, CURRENT_BEATMAP_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [connectionState])

  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false
      return
    }
    if (connectionState !== 'connected') return
    loadBeatmapsets({ forceRefresh: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songsPath])

  useEffect(() => {
    if (connectionState !== 'connected') return
    return onBeatmapsetsListChanged(() => {
      if (isRefreshingRef.current) return
      loadBeatmapsets({ keepScroll: true })
    })
  }, [connectionState, loadBeatmapsets])

  useEffect(() => {
    return onBeatmapsetChanged((folderPath, updated) => {
      if (!updated) return
      setLoadedData((prev) => {
        for (const [index, item] of prev) {
          if (!samePath(item.folderPath, folderPath)) continue
          const next = new Map(prev)
          next.set(index, updated)
          return next
        }
        return prev
      })
      setSearchResults((prev) => {
        const index = prev.findIndex((item) => samePath(item.folderPath, folderPath))
        if (index < 0) return prev
        const next = [...prev]
        next[index] = updated
        return next
      })
      setCurrentBeatmap((prev) =>
        prev?.beatmapset && samePath(prev.beatmapset.folderPath, folderPath)
          ? { ...prev, beatmapset: updated }
          : prev
      )
    })
  }, [])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const handleWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const direction = e.deltaY > 0 ? 1 : -1
      const maxScroll = container.scrollHeight - container.clientHeight
      const nextScroll = Math.max(
        0,
        Math.min((targetIndexRef.current + direction) * ITEM_HEIGHT, maxScroll)
      )
      targetIndexRef.current = Math.round(nextScroll / ITEM_HEIGHT)
      container.scrollTo({ top: nextScroll, behavior: 'smooth' })
    }
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [])

  useEffect(() => {
    setSearchResults([])
    setIsSearching(false)
    if (!search) {
      searchAbort.current?.abort()
      return
    }

    searchAbort.current?.abort()
    const ac = new AbortController()
    searchAbort.current = ac

    setIsSearching(true)
    scrollToTop()

    const accumulated: Beatmapset[] = []
    searchBeatmapsets(search, (chunk) => {
      if (ac.signal.aborted) return
      accumulated.push(...chunk)
      setSearchResults([...accumulated])
    })
      .catch(() => {})
      .finally(() => {
        if (!ac.signal.aborted) setIsSearching(false)
      })
  }, [search, scrollToTop])

  const displayCount = search ? searchResults.length : totalCount

  const { startIndex, endIndex, totalHeight } = useMemo(() => {
    const n = displayCount
    const start = Math.max(0, Math.floor((scrollTop - PADDING) / ITEM_HEIGHT) - BUFFER)
    const end = Math.min(
      n - 1,
      Math.ceil((scrollTop - PADDING + containerHeight) / ITEM_HEIGHT) + BUFFER
    )
    const total = n > 0 ? PADDING * 2 + n * ITEM_HEIGHT - GAP : 0
    return { startIndex: start, endIndex: end, totalHeight: total }
  }, [scrollTop, containerHeight, displayCount])

  useEffect(() => {
    if (search || totalCount === 0) return

    const bufferStart = Math.max(0, startIndex - BUFFER)
    const bufferEnd = Math.min(totalCount - 1, endIndex + BUFFER)
    const startPage = Math.floor(bufferStart / PAGE_SIZE)
    const endPage = Math.floor(bufferEnd / PAGE_SIZE)

    for (let page = startPage; page <= endPage; page++) {
      if (loadedPages.current.has(page) || loadingPages.current.has(page)) continue
      const pageStart = page * PAGE_SIZE
      loadingPages.current.add(page)
      fetchBeatmapsets(pageStart, PAGE_SIZE)
        .then((items) => {
          loadedPages.current.add(page)
          setLoadedData((prev) => {
            const next = new Map(prev)
            items.forEach((item, i) => next.set(pageStart + i, item))
            return next
          })
        })
        .catch(() => {})
        .finally(() => loadingPages.current.delete(page))
    }
  }, [startIndex, endIndex, totalCount, search])

  const handleCardContextMenu = useCallback((e: React.MouseEvent, beatmap: Beatmapset) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, beatmap })
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, visible: false, beatmap: null }))
  }, [])

  const isEmpty =
    connectionState === 'connected' &&
    !isRefreshing &&
    !isSearching &&
    !scanError &&
    displayCount === 0

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border-subtle bg-surface-dark">
      <div className="flex items-center gap-1.5 border-b border-border-subtle p-2">
        <div className="relative flex-1">
          <IconSearch
            size={13}
            stroke={1.5}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            placeholder="Search beatmaps..."
            value={searchInput}
            onChange={(e) => {
              if (e.target.value === '' && searchInput !== '') scrollToTop()
              setSearchInput(e.target.value)
            }}
            className="h-8 w-full rounded-md bg-surface pl-7 pr-7 text-xs text-text-primary placeholder-text-muted outline-none transition-colors focus:ring-1 focus:ring-border"
          />
          {searchInput && (
            <button
              onClick={() => {
                scrollToTop()
                setSearchInput('')
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted transition-colors hover:text-text-secondary"
            >
              <IconX size={12} stroke={2} />
            </button>
          )}
        </div>
        <button
          onClick={() => loadBeatmapsets({ forceRefresh: true })}
          disabled={isRefreshing || connectionState !== 'connected'}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface text-text-dim transition-colors hover:bg-surface-raised hover:text-text-primary disabled:opacity-50"
        >
          <IconRefresh size={16} stroke={1.5} className={isRefreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {currentBeatmap?.status === 'found' && currentBeatmap.beatmapset && (
        <div className="border-b border-border-subtle p-2">
          <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-medium tracking-wide text-primary uppercase">
            <IconDeviceDesktop size={11} stroke={2} />
            Currently open in osu!
          </div>
          <BeatmapCard
            data={currentBeatmap.beatmapset}
            isSelected={selectedPath === currentBeatmap.beatmapset.folderPath}
            onClick={(beatmap) => onSelect?.(beatmap)}
            onContextMenu={handleCardContextMenu}
          />
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        {connectionState === 'connecting' && (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-text-muted">
            <IconRefresh size={28} stroke={1} className="animate-spin" />
            <p className="text-xs">Connecting...</p>
          </div>
        )}
        {connectionState === 'error' && (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-text-muted">
            <IconMusic size={28} stroke={1} />
            <p className="text-xs">Failed to connect</p>
          </div>
        )}
        {isSearching && searchResults.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-text-muted">
            <IconRefresh size={28} stroke={1} className="animate-spin" />
            <p className="text-xs">Searching...</p>
          </div>
        )}
        {connectionState === 'connected' && !isRefreshing && scanError && (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center text-text-muted">
            <IconMusic size={28} stroke={1} />
            <p className="text-xs">{scanError}</p>
          </div>
        )}
        {isEmpty && (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-text-muted">
            <IconMusic size={28} stroke={1} />
            <p className="text-xs">No beatmaps found</p>
          </div>
        )}
        {connectionState === 'connected' && displayCount > 0 && (
          <div
            className={`relative transition-opacity duration-300 ${isRefreshing ? 'opacity-40' : 'opacity-100'}`}
            style={{ height: totalHeight }}
          >
            {Array.from({ length: Math.max(0, endIndex - startIndex + 1) }, (_, i) => {
              const pos = startIndex + i
              const item = search ? searchResults[pos] : loadedData.get(pos)
              return (
                <div
                  key={pos}
                  className="absolute left-0 right-0 px-2"
                  style={{ top: PADDING + pos * ITEM_HEIGHT }}
                >
                  {item ? (
                    <BeatmapCard
                      data={item}
                      isSelected={selectedPath === item.folderPath}
                      onClick={(beatmap) => onSelect?.(beatmap)}
                      onContextMenu={handleCardContextMenu}
                    />
                  ) : (
                    <PlaceholderCard />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {contextMenu.visible && contextMenu.beatmap && (
        <BeatmapContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isSubmitted={contextMenu.beatmap.id !== 0}
          onOpenFolder={() => {
            window.api.shell.openPath(contextMenu.beatmap!.folderPath)
            closeContextMenu()
          }}
          onOpenWebPage={() => {
            window.api.shell.openExternal(
              `https://osu.ppy.sh/beatmapsets/${contextMenu.beatmap!.id}`
            )
            closeContextMenu()
          }}
          onOpenDiscussion={() => {
            window.api.shell.openExternal(
              `https://osu.ppy.sh/beatmapsets/${contextMenu.beatmap!.id}/discussion`
            )
            closeContextMenu()
          }}
          onOpenDirect={() => {
            window.api.shell.openExternal(`osu://dl/${contextMenu.beatmap!.id}`)
            closeContextMenu()
          }}
          onClose={closeContextMenu}
        />
      )}
    </aside>
  )
}
