import { Suspense, lazy, useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

import "./App.css";

import { Titlebar } from "./components/layout/Titlebar";
import { Sidebar, SidebarKey } from "./components/layout/Sidebar";
import { MapSelector } from "./components/layout/MapSelector";
import { UpdateChecker } from "./components/layout/UpdateChecker";
import { BeatmapCustomizer } from "./pages/BeatmapCustomizer";

import { Beatmapset } from "./types/beatmap";

import { useI18n } from "./hooks/i18nContext";
import { useAppState } from "./hooks/appState";

const MAP_TOOLS: SidebarKey[] = [
  "beatmap_clone",
  "beatmap_preview",
  "beatmap_customizer",
  "metadata_editor",
  "metadata_checker",
];

const BeatmapClone = lazy(async () => ({
  default: (await import("./pages/BeatmapClone")).BeatmapClone,
}));
const BeatmapPreview = lazy(async () => ({
  default: (await import("./pages/BeatmapPreview")).BeatmapPreview,
}));
const MetadataEditor = lazy(async () => ({
  default: (await import("./pages/MetadataEditor")).MetadataEditor,
}));
const OffsetCalibrator = lazy(async () => ({
  default: (await import("./pages/OffsetCalibrator")).OffsetCalibrator,
}));
const VideoDownloader = lazy(async () => ({
  default: (await import("./pages/VideoDownloader")).VideoDownloader,
}));
const ImageDownloader = lazy(async () => ({
  default: (await import("./pages/ImageDownloader")).ImageDownloader,
}));
const AudioAnalyzer = lazy(async () => ({
  default: (await import("./pages/AudioAnalyzer")).AudioAnalyzer,
}));
const MetadataChecker = lazy(async () => ({
  default: (await import("./pages/MetadataChecker")).MetadataChecker,
}));

function ToolLoading() {
  return (
    <div className="flex h-full items-center justify-center text-text-muted">
      Loading...
    </div>
  );
}

function App() {
  const [activeTool, setActiveTool] = useState<SidebarKey>("beatmap_customizer");
  const [selectedBeatmap, setSelectedBeatmap] = useState<Beatmapset | null>(null);

  const { songsFolder } = useAppState();

  const { t } = useI18n();

  useEffect(() => {
    setSelectedBeatmap(null);
  }, [songsFolder]);

  const showMapSelector = MAP_TOOLS.includes(activeTool);

  const backgroundImage = selectedBeatmap?.background_path
    ? `url("${convertFileSrc(selectedBeatmap.background_path)}")`
    : "none";

  const hasBackground = selectedBeatmap?.background_path;

  const renderContent = () => {
    if (showMapSelector && !selectedBeatmap) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="text-6xl mb-4 opacity-20">🎵</div>
            <h2 className="mb-2 text-2xl font-bold text-text-primary">
              {t("app.selectBeatmap.title")}
            </h2>
            <p className="text-text-muted">
              {t("app.selectBeatmap.desc")}
            </p>
          </div>
        </div>
      );
    }

    switch (activeTool) {
      case "beatmap_clone":
        return <BeatmapClone selectedBeatmap={selectedBeatmap} />;
      case "beatmap_preview":
        return <BeatmapPreview selectedBeatmap={selectedBeatmap} />;
      case "beatmap_customizer":
        return <BeatmapCustomizer selectedBeatmap={selectedBeatmap} />;
      case "metadata_editor":
        return <MetadataEditor selectedBeatmap={selectedBeatmap} />;
      case "metadata_checker":
        return <MetadataChecker selectedBeatmap={selectedBeatmap} />;
      case "offset_calibrator":
        return <OffsetCalibrator />;
      case "video_downloader":
        return <VideoDownloader />;
      case "audio_analyzer":
        return <AudioAnalyzer />;
      case "image_downloader":
        return <ImageDownloader />;
      default:
        return null;
    }
  };

  return (
    <>
      <UpdateChecker />
      <Titlebar />

      {hasBackground && (
        <div
          className="app-offset-top fixed inset-0 transition-opacity duration-500 ease-in-out"
          style={{
            backgroundImage: backgroundImage,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(8px) brightness(0.6)",
            zIndex: 0,
          }}
        />
      )}

      <main className="app-main-height app-offset-top relative z-10 flex animate-in fade-in font-sans text-white selection:bg-blue-600/30">
        <Sidebar
          active={activeTool}
          onChange={setActiveTool}
          className={hasBackground ? "bg-surface-sidebar/90 backdrop-blur-md" : ""}
        />

        {showMapSelector && (
          <MapSelector
            onSelect={setSelectedBeatmap}
            selectedBeatmap={selectedBeatmap}
            className={hasBackground ? "bg-surface-sidebar/90 backdrop-blur-md" : ""}
          />
        )}

        <div
          className={`flex-1 overflow-auto p-3 text-white transition-colors duration-300 ${
            hasBackground
              ? "bg-surface-base/70 backdrop-blur-sm"
              : "bg-surface-base"
          }`}
        >
          <Suspense fallback={<ToolLoading />}>{renderContent()}</Suspense>
        </div>
      </main>
    </>
  );
}

export default App;
