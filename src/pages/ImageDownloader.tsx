import { useState, useCallback, useMemo } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { FiLink, FiImage, FiAlertCircle, FiFolder, FiFile, FiX } from "react-icons/fi";

import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { Input } from "../components/common/Input";
import { Chip } from "../components/common/Chip";

import { useI18n } from "../hooks/i18nContext";

export function ImageDownloader() {
  const { t } = useI18n();

  const [input, setInput] = useState("");
  const [pickedFile, setPickedFile] = useState<string>("");
  const [outDir, setOutDir] = useState<string>("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);

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

    if (!outDir.trim()) {
      setError(t("image.error.noOutDir"));
      return;
    }

    setBusy(true);
    try {
      let path: string;

      if (kind === "file") {
        path = await invoke<string>("process_image_to_thumbnail", {
          srcPath: pickedFile,
          outDir,
          useWaifu2x: false,
        });
      } else if (kind === "youtube") {
        const vid = extractVideoId(input);
        if (!vid) {
          throw new Error(t("image.invalidUrl"));
        }
        path = await invoke<string>("process_thumbnail", { videoId: vid });
      } else if (kind === "url") {
        path = await invoke<string>("process_url_to_thumbnail", {
          imageUrl: input,
          outDir,
          useWaifu2x: false,
        });
      } else {
        throw new Error(t("image.error.noInput"));
      }

      setImageSrc(convertFileSrc(path));
      void openPath(outDir);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [kind, input, pickedFile, outDir, t]);

  return (
    <div className="flex flex-col gap-2 text-zinc-200">
      <Card className="flex items-center gap-2 p-2">
        <div className="flex items-center gap-2 px-3 h-9 rounded-lg bg-[#1f1f1f] border border-[#2a2a2a] w-full max-w-[min(44%,620px)]">
          <FiLink className="text-[#7b7b7b] shrink-0" />
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
          className="min-w-0 max-w-[min(48%,820px)] text-left disabled:opacity-100"
          title={pickedFile ? t("image.button.clearImageTitle") : (pickedFile || t("image.noImage"))}
          aria-label={pickedFile ? t("image.button.clearImage") : undefined}
        >
          <Chip icon={pickedFile ? <FiX /> : <FiFile />} className="min-w-0 w-full" title={pickedFile || t("image.noImage")}>
            {pickedFile || t("image.noImage")}
          </Chip>
        </button>
        <Chip icon={<FiFolder />} className="min-w-0 max-w-[min(48%,820px)]" title={outDir || t("image.noFolder")}>
          {outDir || t("image.noFolder")}
        </Chip>
      </Card>

      {error && (
        <Card className="flex items-center gap-2 p-3 border-red-500/50">
          <FiAlertCircle className="text-red-400 shrink-0" />
          <span className="text-red-400 text-sm">{error}</span>
        </Card>
      )}

      {imageSrc && (
        <Card className="flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a2a]">
            <span className="text-sm opacity-80">{t("image.preview")}</span>
            <span className="text-xs opacity-60">{t("image.previewSize")}</span>
          </div>
          <div className="p-3">
            <img src={imageSrc} alt="image" className="w-full rounded border border-[#2a2a2a]" />
          </div>
        </Card>
      )}
    </div>
  );
}
