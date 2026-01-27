import { useState, useCallback } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { FiLink, FiImage, FiAlertCircle, FiDownload } from "react-icons/fi";

import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { Input } from "../components/common/Input";

import { useI18n } from "../hooks/i18nContext";

export function ThumbnailDownloader() {
    const { t } = useI18n();
    const [url, setUrl] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [imagePath, setImagePath] = useState<string | null>(null);
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

    const run = useCallback(async () => {
        setError(null);
        setImageSrc(null);
        setImagePath(null);

        const videoId = extractVideoId(url);
        if (!videoId) {
            setError(t("thumbnail.invalidUrl"));
            return;
        }

        setBusy(true);
        try {
            const path = await invoke<string>("process_thumbnail", { videoId });
            setImagePath(path);
            setImageSrc(convertFileSrc(path));
        } catch (e: any) {
            setError(String(e));
        } finally {
            setBusy(false);
        }
    }, [url]);

    const handleDownload = useCallback(async () => {
        if (!imagePath) return;

        const dest = await save({
            defaultPath: "thumbnail.jpg",
            filters: [
                { name: "JPEG", extensions: ["jpg", "jpeg"] },
            ],
        });

        if (dest) {
            try {
                await invoke("save_thumbnail", { src: imagePath, dest });
                const folder = dest.replace(/[\\/][^\\/]+$/, "");
                await openPath(folder || dest);
            } catch (e: any) {
                setError(String(e));
            }
        }
    }, [imagePath]);

    return (
        <div className="flex flex-col gap-2 text-zinc-200">
            <Card className="flex items-center gap-2 p-2">
                <div className="flex items-center gap-2 px-3 h-9 rounded-lg bg-[#1f1f1f] border border-[#2a2a2a] w-full max-w-[min(60%,720px)]">
                    <FiLink className="text-[#7b7b7b] flex-shrink-0" />
                        <Input
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder={t("thumbnail.urlPlaceholder")}
                            disabled={busy}
                            className="bg-transparent border-0 h-auto px-0 focus:border-0"
                        />
                </div>

                <div className="flex-1" />

                <Button
                    variant="primary"
                    icon={<FiImage />}
                    onClick={run}
                    disabled={busy}
                >
                    {busy ? t("thumbnail.processing") : t("thumbnail.generate")}
                </Button>

                <Button
                    variant="secondary"
                    icon={<FiDownload />}
                    onClick={handleDownload}
                    disabled={!imagePath}
                >
                    {t("thumbnail.save")}
                </Button>
            </Card>

            {error && (
                <Card className="flex items-center gap-2 p-3 border-red-500/50">
                    <FiAlertCircle className="text-red-400 flex-shrink-0" />
                    <span className="text-red-400 text-sm">{error}</span>
                </Card>
            )}

            {imageSrc && (
                <Card className="flex flex-col">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a2a]">
                        <span className="text-sm opacity-80">{t("thumbnail.preview")}</span>
                        <span className="text-xs opacity-60">{t("thumbnail.previewSize")}</span>
                    </div>
                    <div className="p-3">
                        <img
                            src={imageSrc}
                            alt="thumbnail"
                            className="w-full rounded border border-[#2a2a2a]"
                        />
                    </div>
                </Card>
            )}
        </div>
    );
}
