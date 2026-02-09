import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

import "./App.css";

import { Titlebar } from "./components/Titlebar";
import { Sidebar, SidebarKey } from "./components/Sidebar";
import { MapSelector } from "./components/MapSelector";
import { UpdateChecker } from "./components/UpdateChecker";

import { OffsetCalibrator } from "./pages/OffsetCalibrator";
import { BeatmapPreview } from "./pages/BeatmapPreview";
import { BeatmapCustomizer } from "./pages/BeatmapCustomizer";
import { VideoDownloader } from "./pages/VideoDownloader";
import { BeatmapClone } from "./pages/BeatmapClone";
import { MetadataEditor } from "./pages/MetadataEditor";
import AudioAnalyzer from "./components/AudioAnalyzer/AudioAnalyzer";

import { Beatmapset } from "./types/beatmap";
import { ImageDownloader } from "./pages/ImageDownloader";

import { useI18n } from "./hooks/i18nContext";
import { useAppState } from "./context/appState";

const MAP_TOOLS: SidebarKey[] = [
  "beatmap_clone",
  "beatmap_preview",
  "beatmap_customizer",
  "metadata_editor",
];

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
            <h2 className="text-2xl font-bold text-[#eeeeee] mb-2">
              {t("app.selectBeatmap.title")}
            </h2>
            <p className="text-[#7b7b7b]">
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
        return <BeatmapPreview selectedBeatmap={selectedBeatmap} />
      case "beatmap_customizer":
        return <BeatmapCustomizer selectedBeatmap={selectedBeatmap} />;
      case "metadata_editor":
        return <MetadataEditor selectedBeatmap={selectedBeatmap} />
      case "offset_calibrator":
        return <OffsetCalibrator />;
      case "video_downloader":
        return <VideoDownloader />;
      case "audio_analyzer":
        return <AudioAnalyzer />;
      case "image_downloader":
        return <ImageDownloader />
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
          className="fixed inset-0 mt-[40px] transition-opacity duration-500 ease-in-out"
          style={{
            backgroundImage: backgroundImage,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(8px) brightness(0.6)",
            zIndex: 0,
          }}
        />
      )}

      <main className="relative flex h-[calc(100vh-40px)] mt-[40px] text-white font-sans selection:bg-blue-600/30 animate-in fade-in z-10">
        <Sidebar
          active={activeTool}
          onChange={setActiveTool}
          className={hasBackground ? "bg-[#191919]/90 backdrop-blur-md" : ""}
        />

        {showMapSelector && (
          <MapSelector
            onSelect={setSelectedBeatmap}
            selectedBeatmap={selectedBeatmap}
            className={hasBackground ? "bg-[#191919]/90 backdrop-blur-md" : ""}
          />
        )}

        <div className={`flex-1 text-white p-3 overflow-auto transition-colors duration-300 ${hasBackground
          ? "bg-[#1f1f1f]/70 backdrop-blur-sm"
          : "bg-[#1f1f1f]"
          }`}>
          {renderContent()}
        </div>
      </main>
    </>
  );
}

export default App;
