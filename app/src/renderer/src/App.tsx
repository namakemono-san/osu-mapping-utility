import { useCallback, useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { TitleBar } from './components/TitleBar'
import { BeatmapsetSelector } from './components/beatmapset/BeatmapsetSelector'
import { MapsetCloner } from './pages/MapsetCloner'
import { MapsetTweaker } from './pages/MapsetTweaker'
import { MetadataEditor } from './pages/MetadataEditor'
import { Downloader } from './pages/Downloader'
import { AudioInspector } from './pages/AudioInspector'
import { OffsetCalibrator } from './pages/OffsetCalibrator'
import { Home } from './pages/Home'
import { Sidebar, type SidebarKey } from './components/Sidebar'
import { Settings } from './components/Settings'
import { UpdateModal } from './components/UpdateModal'
import { useAutoUpdater } from './hooks/useAutoUpdater'
import { getSongsPath, onBeatmapsetChanged, type Beatmapset } from './services'
import { samePath } from './utils/paths'
import { useLocalStorage, type Codec } from './utils/useLocalStorage'

const songsFolderCodec: Codec<string | null> = {
  serialize: (value) => value ?? '',
  deserialize: (raw) => raw || null
}

function App(): React.JSX.Element {
  const [selectedBeatmap, setSelectedBeatmap] = useState<Beatmapset | null>(null)
  const [activeTool, setActiveTool] = useState<SidebarKey>('mapset_tweaker')
  const [interacted, setInteracted] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [songsFolder, setSongsFolder] = useLocalStorage<string | null>(
    'songsFolder',
    null,
    songsFolderCodec
  )
  const updater = useAutoUpdater()

  useEffect(() => {
    return onBeatmapsetChanged((folderPath, updated) => {
      if (!updated) return
      setSelectedBeatmap((prev) => (prev && samePath(prev.folderPath, folderPath) ? updated : prev))
    })
  }, [])

  const handleToolChange = (tool: SidebarKey): void => {
    setActiveTool(tool)
    setInteracted(true)
  }

  const handleBeatmapSelect = (beatmapset: Beatmapset | null): void => {
    setSelectedBeatmap(beatmapset)
    if (beatmapset) setInteracted(true)
  }

  const handleSettingsOpen = useCallback(() => {
    if (songsFolder) return
    getSongsPath()
      .then((path) => {
        if (path) setSongsFolder(path)
      })
      .catch((e: unknown) => {
        console.error('Failed to detect osu! Songs folder:', e)
      })
  }, [songsFolder, setSongsFolder])

  const renderTool = (): React.ReactNode => {
    if (!interacted && !selectedBeatmap && activeTool !== 'media_downloader') return <Home />
    switch (activeTool) {
      case 'mapset_cloner':
        return <MapsetCloner beatmapset={selectedBeatmap} />
      case 'mapset_tweaker':
        return <MapsetTweaker beatmapset={selectedBeatmap} />
      case 'metadata_editor':
        return <MetadataEditor beatmapset={selectedBeatmap} />
      case 'media_downloader':
        return <Downloader />
      case 'audio_inspector':
        return <AudioInspector beatmapset={selectedBeatmap} />
      case 'offset_calibrator':
        return <OffsetCalibrator beatmapset={selectedBeatmap} />
      default:
        return <Home />
    }
  }

  return (
    <>
      <Toaster position="top-center" theme="dark" richColors />
      <TitleBar onOpenSettings={() => setSettingsOpen(true)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar active={activeTool} onChange={handleToolChange} />
        <BeatmapsetSelector
          selectedPath={selectedBeatmap?.folderPath ?? null}
          onSelect={handleBeatmapSelect}
          songsPath={songsFolder}
        />
        <main className="flex-1 overflow-hidden bg-surface-deep">{renderTool()}</main>
      </div>
      <Settings
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        songsFolder={songsFolder}
        onSongsFolder={setSongsFolder}
        onOpen={handleSettingsOpen}
        updater={updater}
      />
      <UpdateModal state={updater} />
    </>
  )
}

export default App
