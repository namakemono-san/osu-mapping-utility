import { useState } from "react";
import { FiImage, FiSave, FiUpload } from "react-icons/fi";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

import { Button } from "../common/Button";
import { Card } from "../common/Card";
import { StatusMessage } from "../common/StatusMessage";
import { useI18n } from "../../hooks/i18nContext";

import Spectrogram from "./Spectrogram";
import MetadataPanel from "./MetadataPanel";
import type { AudioAnalysisResult, AudioAnalyzerProps } from "./types";

function toErrorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

export default function AudioAnalyzer({ className = "" }: AudioAnalyzerProps) {
  const { t } = useI18n();
  const [result, setResult] = useState<AudioAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const handleFileSelect = async () => {
    try {
      const selected = await open({
        filters: [{ name: "Audio", extensions: ["mp3", "ogg"] }],
        multiple: false,
      });

      if (!selected || Array.isArray(selected)) return;

      setLoading(true);
      setError(null);
      setExportSuccess(null);
      setSelectedFilePath(selected);

      const analysisResult = await invoke<AudioAnalysisResult>("analyze_audio", {
        filePath: selected,
      });

      setResult(analysisResult);
    } catch (err) {
      setError(toErrorMessage(err));
      setResult(null);
    } finally {
      setLoading(false);
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
    <div className={`flex flex-col gap-2 text-zinc-200 ${className}`}>
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

        <div className="ml-auto text-xs text-text-faint inline-flex items-center gap-2">
          <FiImage />
          <span>{result ? `${result.image_width} x ${result.image_height}` : "800 x 450"}</span>
        </div>
      </Card>

      {loading && <StatusMessage type="success" message={t("audio.status.loading")} />}
      {error && <StatusMessage type="error" message={error} />}
      {exportSuccess && <StatusMessage type="success" message={exportSuccess} />}

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
