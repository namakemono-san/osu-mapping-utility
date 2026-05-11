import { useState, useEffect, useCallback } from "react";
import { FiSave, FiUpload } from "react-icons/fi";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";

import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { StatusMessage } from "../../components/StatusMessage";
import { useI18n } from "../../hooks/i18nContext";

import Spectrogram from "./Spectrogram";
import MetadataPanel from "./MetadataPanel";
import type { AudioAnalysisResult, AudioAnalyzerProps } from "./types";

function toErrorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function AudioAnalyzer({ className = "" }: AudioAnalyzerProps) {
  const { t } = useI18n();
  const [result, setResult] = useState<AudioAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleAnalyze = useCallback(async (filePath: string) => {
    setLoading(true);
    setError(null);
    setExportSuccess(null);
    setSelectedFilePath(filePath);

    try {
      const analysisResult = await invoke<AudioAnalysisResult>("analyze_audio", {
        filePath,
      });
      setResult(analysisResult);
    } catch (err) {
      setError(toErrorMessage(err));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    function register() {
      getCurrentWebview()
        .onDragDropEvent((event) => {
          const payload = event.payload;
          if (payload.type === "drop") {
            setIsDraggingOver(false);
            const audioFile = payload.paths.find((p) => /\.(mp3|ogg)$/i.test(p));
            if (audioFile) {
              handleAnalyze(audioFile);
            }
            unlisten?.();
            unlisten = undefined;
            if (active) register();
          } else if (payload.type === "enter" || payload.type === "over") {
            setIsDraggingOver(true);
          } else if (payload.type === "leave") {
            setIsDraggingOver(false);
          }
        })
        .then((fn) => {
          if (active) {
            unlisten = fn;
          } else {
            fn();
          }
        });
    }

    register();

    return () => {
      active = false;
      unlisten?.();
    };
  }, [handleAnalyze]);

  const handleFileSelect = async () => {
    try {
      const selected = await open({
        filters: [{ name: "Audio", extensions: ["mp3", "ogg"] }],
        multiple: false,
      });

      if (!selected || Array.isArray(selected)) return;

      handleAnalyze(selected);
    } catch (err) {
      setError(toErrorMessage(err));
    }
  };

  const handleExport = async () => {
    if (!selectedFilePath || !result) return;

    try {
      setError(null);
      const outputPath = await save({
        filters: [{ name: "PNG Image", extensions: ["png"] }],
        defaultPath: "spectrogram.png",
      });

      if (!outputPath) return;

      setLoading(true);
      await invoke("export_spectrogram", {
        filePath: selectedFilePath,
        outputPath,
      });

      setExportSuccess(t("audio.export.success"));
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`relative flex flex-col gap-2 text-zinc-200 ${className}`}>
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-pink-400 bg-zinc-900/80 pointer-events-none">
          <span className="text-lg font-semibold text-pink-300">{t("audio.dropOverlay")}</span>
        </div>
      )}

      <Card className="flex flex-wrap items-center gap-2 p-2">
        <Button icon={<FiUpload />} variant="primary" onClick={handleFileSelect} disabled={loading}>
          {t("audio.button.select")}
        </Button>
        <Button
          icon={<FiSave />}
          variant="secondary"
          onClick={handleExport}
          disabled={loading || !result || !selectedFilePath}
        >
          {t("audio.button.export")}
        </Button>
      </Card>

      {loading && <StatusMessage type="success" message={t("audio.status.loading")} />}
      {error && <StatusMessage type="error" message={error} />}
      {exportSuccess && <StatusMessage type="success" message={exportSuccess} />}

      {!result && !loading && (
        <Card className="flex items-center justify-center p-8 text-sm text-zinc-500">
          {t("audio.dropHint", { select: t("audio.button.select") })}
        </Card>
      )}

      {result && (
        <div className="grid grid-cols-1 xl-grid-cols-layout gap-2 min-h-520">
          <MetadataPanel
            sampleRate={result.sample_rate}
            originalSampleRate={result.original_sample_rate}
            frequencyCutoffHz={result.frequency_cutoff_hz}
            channels={result.channels}
            bitsPerSample={result.bits_per_sample}
            fileSizeBytes={result.file_size_bytes}
            originalSizeBytes={result.original_size_bytes}
            averageBitrateKbps={result.average_bitrate_kbps}
            decodeMs={result.decode_ms}
            analyzeMs={result.analyze_ms}
            renderMs={result.render_ms}
            totalMs={result.total_ms}
            format={selectedFilePath?.toLowerCase().endsWith(".ogg") ? "ogg" : "mp3"}
          />

          <Card className="p-2 flex items-center justify-center overflow-auto">
            <div className="w-full max-w-860">
              <Spectrogram imageBase64={result.image_base64} />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
