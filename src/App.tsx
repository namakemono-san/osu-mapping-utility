import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

import "./App.css";

import { Titlebar } from "./components/Titlebar";
import { Sidebar, SidebarKey } from "./components/Sidebar";
import { MapSelector } from "./components/MapSelector";
import { UpdateChecker } from "./components/UpdateChecker";

import { OffsetCalibrator } from "./pages/OffsetCalibrator";
import { BeatmapCustomizer } from "./pages/BeatmapCustomizer";
import { Downloader } from "./pages/Downloader";
import { BeatmapClone } from "./pages/BeatmapClone";

const MAP_TOOLS: SidebarKey[] = [
  "beatmap_clone",
  "beatmap_customizer",
  "metadata_editor",
];

function App() {
  const [activeTool, setActiveTool] = useState<SidebarKey>("beatmap_customizer");
  const [selectedBeatmap, setSelectedBeatmap] = useState<any>(null);

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
              Select a Beatmap
            </h2>
            <p className="text-[#7b7b7b]">
              Choose a beatmap from the left sidebar to get started
            </p>
          </div>
        </div>
      );
    }

    switch (activeTool) {
      case "beatmap_clone":
        return <BeatmapClone selectedBeatmap={selectedBeatmap} />;
      case "beatmap_customizer":
        return <BeatmapCustomizer selectedBeatmap={selectedBeatmap} />;
      case "metadata_editor":
        return (
          <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-4">Metadata Editor</h1>
            <div className="bg-[#191919] p-6 rounded-lg border border-[#2a2a2a]">
              <p className="text-[#7b7b7b]">Coming soon...</p>
            </div>
          </div>
        );
      case "offset_calibrator":
        return <OffsetCalibrator />;
      case "downloader":
        return <Downloader />;
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