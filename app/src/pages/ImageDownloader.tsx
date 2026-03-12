import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { FiLink, FiImage, FiAlertCircle, FiFolder, FiFile, FiX, FiTrash2 } from "react-icons/fi";

import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input } from "../components/Input";
import { Chip } from "../components/Chip";

import { useDownloaderSettings } from "../hooks/useStorage";
import { useI18n } from "../hooks/i18nContext";

export function ImageDownloader() {
  const { t } = useI18n();

  const [input, setInput] = useState("");
  const [pickedFile, setPickedFile] = useState<string>("");

  const { outDir, setOutDir } = useDownloaderSettings();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"log" | "preview">("log");
  const logRef = useRef<HTMLPreElement | null>(null);

  const appendLog = useCallback((msg: string) => {
    setLogLines((prev) => {
      const next = [...prev, msg];
      if (next.length > 500) return next.slice(next.length - 500);
      return next;
    });
  }, []);

  const clearLog = useCallback(() => setLogLines([]), []);

  const extractVideoId = (url: string): string | null => {
    try {
      const u = new URL(url);
      if (u.hostname === "youtu.be") {
        return u.pathname.slice(1);
      }
      return u.searchParams.get("v");
    } catch {
      return null;
    }
  };

  const inferKind = useCallback(
    (s: string, picked: string): "youtube" | "url" | "file" | "empty" => {
      if (picked.trim()) return "file";
      const v = s.trim();
      if (!v) return "empty";
      const vid = extractVideoId(v);
      if (vid) return "youtube";
      if (v.startsWith("http://") || v.startsWith("https://")) return "url";
      return "empty";
    },
    []
  );

  const kind = useMemo(() => inferKind(input, pickedFile), [inferKind, input, pickedFile]);

  const pickLocalImage = useCallback(async () => {
    setError(null);
    const res = await open({
      multiple: false,
      directory: false,
      title: t("image.dialog.selectImage"),
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] }],
    });
    if (typeof res === "string") {
      setPickedFile(res);
    }
  }, [t]);

  const pickOutDir = useCallback(async () => {
    setError(null);
    const res = await open({
      multiple: false,
      directory: true,
      title: t("image.dialog.selectOutFolder"),
      defaultPath: outDir || undefined,
    });
    if (typeof res === "string") {
      setOutDir(res);
    }
  }, [outDir, t]);

  const clearPickedFile = useCallback(() => {
    setPickedFile("");
  }, []);

  const run = useCallback(async () => {
    setError(null);
    setImageSrc(null);
    setActiveTab("log");

    if (!outDir.trim()) {
      setError(t("image.error.noOutDir"));
      return;
    }

    setBusy(true);
    try {
      let path: string;

      if (kind === "file") {
        appendLog(`[info] ${pickedFile}`);
        path = await invoke<string>("process_thumbnail_from_image", {
          srcPath: pickedFile,
          outDir,
          useWaifu2x: false,
        });
      } else if (kind === "youtube") {
        const vid = extractVideoId(input);
        if (!vid) {
          throw new Error(t("image.invalidUrl"));
        }
        appendLog(`[info] video_id=${vid}`);
        path = await invoke<string>("process_thumbnail_from_video_id", { videoId: vid, outDir });
      } else if (kind === "url") {
        appendLog(`[info] ${input}`);
        path = await invoke<string>("process_thumbnail_from_url", {
          imageUrl: input,
          outDir,
          useWaifu2x: false,
        });
      } else {
        throw new Error(t("image.error.noInput"));
      }

      appendLog(`[done] ${path}`);
      setImageSrc(convertFileSrc(path));
      setActiveTab("preview");
      void openPath(outDir);
    } catch (e: unknown) {
      appendLog(`[error] ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [kind, input, pickedFile, outDir, t, appendLog]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logLines]);

  return (
    <div className="flex flex-col gap-2 text-zinc-200">
      <Card className="flex items-center gap-2 p-2">
        <div className="flex items-center gap-2 px-3 h-9 rounded-lg bg-surface-base border border-border-muted w-full max-w-min-44-620">
          <FiLink className="text-text-muted shrink-0" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("image.inputPlaceholder")}
            disabled={busy || pickedFile.length > 0}
            className="bg-transparent border-0 h-auto px-0 focus:border-0"
          />
        </div>

        <Button variant="secondary" icon={<FiFile />} onClick={pickLocalImage} disabled={busy}>
          {pickedFile ? t("image.button.imagePicked") : t("image.button.image")}
        </Button>

        <Button variant="secondary" icon={<FiFolder />} onClick={pickOutDir} disabled={busy}>
          {t("image.button.folder")}
        </Button>

        <div className="flex-1" />

        <Button variant="primary" icon={<FiImage />} onClick={run} disabled={busy}>
          {busy ? t("image.processing") : t("image.button.process")}
        </Button>
      </Card>

      <Card className="flex items-center gap-2 p-2">
        <button
          type="button"
          onClick={pickedFile ? clearPickedFile : undefined}
          disabled={busy || !pickedFile}
          className="min-w-0 max-w-min-48-820 text-left disabled:opacity-100"
          title={pickedFile ? t("image.button.clearImageTitle") : (pickedFile || t("image.noImage"))}
          aria-label={pickedFile ? t("image.button.clearImage") : undefined}
        >
          <Chip icon={pickedFile ? <FiX /> : <FiFile />} className="min-w-0 w-full" title={pickedFile || t("image.noImage")}>
            {pickedFile || t("image.noImage")}
          </Chip>
        </button>
        <Chip icon={<FiFolder />} className="min-w-0 max-w-min-48-820" title={outDir || t("image.noFolder")}>
          {outDir || t("image.noFolder")}
        </Chip>

        <div className="flex-1" />

        <Button
          variant="danger"
          icon={<FiTrash2 />}
          onClick={clearLog}
          disabled={busy || logLines.length === 0}
          title={t("image.button.clearLogTitle")}
        >
          {t("image.button.clearLog")}
        </Button>
      </Card>

      {error && (
        <Card className="flex items-center gap-2 p-3 border-red-500/50">
          <FiAlertCircle className="text-red-400 shrink-0" />
          <span className="text-red-400 text-sm">{error}</span>
        </Card>
      )}

      <div>
        <div className="flex">
          <button
            type="button"
            onClick={() => setActiveTab("log")}
            className={`px-3 py-2 text-sm border-t border-l border-r rounded-t-lg transition-colors ${
              activeTab === "log"
                ? "bg-surface-base border-border-muted text-text-primary border-b-surface-base"
                : "bg-surface-elevated border-border-strong text-text-muted hover:text-text-primary hover:bg-surface-hover border-b-border-muted"
            }`}
          >
            {t("image.log.title")}
          </button>
          {imageSrc && (
            <button
              type="button"
              onClick={() => setActiveTab("preview")}
              className={`px-3 py-2 text-sm border-t border-l border-r rounded-t-lg transition-colors -ml-px ${
                activeTab === "preview"
                  ? "bg-surface-base border-border-muted text-text-primary border-b-surface-base"
                  : "bg-surface-elevated border-border-strong text-text-muted hover:text-text-primary hover:bg-surface-hover border-b-border-muted"
              }`}
            >
              {t("image.preview")}
            </button>
          )}
          <div className="flex-1 border-b border-border-muted"></div>
          {activeTab === "preview" && imageSrc && (
            <span className="text-xs opacity-60 self-center mr-3">{t("image.previewSize")}</span>
          )}
        </div>

        <Card className="border-t-0 rounded-t-none">
          {activeTab === "log" && (
            <pre
              ref={logRef}
              className="font-mono text-sm whitespace-pre-wrap wrap-break-word px-3 py-2 h-40 overflow-auto"
            >
              {logLines.length > 0 ? logLines.join("\n") : t("image.log.ready")}
            </pre>
          )}

          {activeTab === "preview" && imageSrc && (
            <div className="p-3">
              <img src={imageSrc} alt="image" className="w-full rounded border border-border-muted" />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
