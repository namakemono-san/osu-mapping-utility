import { useEffect, useRef, useCallback, useMemo } from "react";
import { FiLink, FiFolder, FiDownload, FiFilm, FiMusic, FiTrash2, FiSliders } from "react-icons/fi";

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";

import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { Input } from "../components/common/Input";
import { Select } from "../components/common/Select";
import { Switch } from "../components/common/Switch";
import { Chip } from "../components/common/Chip";

import { useDownloaderSettings } from "../hooks/useStorage";
import { useState } from "react";

import { useI18n } from "../hooks/i18nContext";

export function VideoDownloader() {
    const { t } = useI18n();
    const [url, setUrl] = useState("");
    const [busy, setBusy] = useState(false);
    const [logLines, setLogLines] = useState<string[]>([]);
    const [lastVideoPath, setLastVideoPath] = useState<string>("");
    const logRef = useRef<HTMLPreElement | null>(null);

    const includeVideoRef = useRef(false);
    const autoTaikoVideoRef = useRef(false);
    const outDirRef = useRef("");
    const audioDoneRef = useRef(false);
    const videoDoneRef = useRef(false);
    const taikoDoneRef = useRef(false);
    const openedRef = useRef(false);

    const {
        audioFormat,
        setAudioFormat,
        includeVideo,
        setIncludeVideo,
        autoTaikoVideo,
        setAutoTaikoVideo,
        outDir,
        setOutDir,
    } = useDownloaderSettings();

    const appendLog = useCallback((payload: string) => {
        const s = typeof payload === "string" ? payload : JSON.stringify(payload);
        const normalized = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        const parts = normalized.split("\n");
        setLogLines((prev) => {
            const next = [...prev];
            for (const p of parts) {
                if (p.length === 0) continue;
                next.push(p);
            }
            if (next.length > 1500) return next.slice(next.length - 1500);
            return next;
        });
    }, []);

    const pickDir = useCallback(async () => {
        const dir = await open({
            directory: true,
            multiple: false,
            title: t("video.dialog.selectOutFolder"),
            defaultPath: outDir || undefined,
        });
        if (typeof dir === "string") {
            setOutDir(dir);
        }
    }, [outDir, setOutDir]);

    const startDownload = useCallback(async () => {
        if (!url.trim()) {
            alert(t("video.alert.enterUrl"));
            return;
        }
        if (!outDir.trim()) {
            alert(t("video.alert.selectOutFolder"));
            return;
        }

        const effectiveIncludeVideo = includeVideo || autoTaikoVideo;
        setBusy(true);
        audioDoneRef.current = false;
        videoDoneRef.current = false;
        taikoDoneRef.current = false;
        openedRef.current = false;
        try {
            const res = await invoke<string>("run_download", {
                url,
                outDir,
                audioFormat,
                includeVideo: effectiveIncludeVideo,
                autoTaikoVideo,
            });
            if (res !== "started") {
                appendLog(res);
            }
        } catch (e: any) {
            appendLog(`[ui][err] ${String(e)}`);
        }
    }, [url, outDir, audioFormat, includeVideo, autoTaikoVideo, appendLog, t]);

    const runTaikoProcess = useCallback(async () => {
        if (!lastVideoPath.trim()) {
            alert(t("video.alert.noVideoToProcess"));
            return;
        }
        if (!outDir.trim()) {
            alert(t("video.alert.selectOutFolder"));
            return;
        }

        setBusy(true);
        try {
            const outPath = await invoke<string>("convert_taiko_video", {
                srcPath: lastVideoPath,
                outDir,
            });
            appendLog(`[ui][taiko] output=${outPath}`);
        } catch (e: any) {
            appendLog(`[ui][taiko-err] ${String(e)}`);
        } finally {
            setBusy(false);
        }
    }, [appendLog, lastVideoPath, outDir, t]);

    const clearLog = useCallback(() => setLogLines([]), []);

    const formatMeta = useMemo(() => {
        const willIncludeVideo = includeVideo || autoTaikoVideo;
        return t("video.meta.format", {
            format: audioFormat.toUpperCase(),
            extra: `${willIncludeVideo ? t("video.meta.video") : ""}${autoTaikoVideo ? t("video.meta.taiko") : ""}`,
        });
    }, [audioFormat, includeVideo, autoTaikoVideo, t]);

    useEffect(() => {
        includeVideoRef.current = includeVideo;
    }, [includeVideo]);

    useEffect(() => {
        autoTaikoVideoRef.current = autoTaikoVideo;
    }, [autoTaikoVideo]);

    useEffect(() => {
        if (!includeVideo && autoTaikoVideo) {
            setAutoTaikoVideo(false);
            appendLog("[ui] auto taiko video requires including video");
        }
    }, [includeVideo, autoTaikoVideo, setAutoTaikoVideo, appendLog]);

    useEffect(() => {
        outDirRef.current = outDir;
    }, [outDir]);

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        listen<string>("download-progress", (e) => {
            appendLog(e.payload);

            const msg = String(e.payload);
            if (msg.includes("[audio][done]")) {
                audioDoneRef.current = true;
            }
            if (msg.includes("[video][done]")) {
                videoDoneRef.current = true;
            }
            if (
                msg.includes("[taiko][done]") ||
                msg.includes("[taiko][skip]") ||
                msg.includes("[taiko][spawn-error]")
            ) {
                taikoDoneRef.current = true;
            }

            if (msg.startsWith("[video][out] ")) {
                const p = msg.slice("[video][out] ".length).trim();
                if (p && p.includes("-background.")) {
                    setLastVideoPath(p);
                }
            }

            const needsVideo = includeVideoRef.current || autoTaikoVideoRef.current;
            const shouldOpen =
                !openedRef.current &&
                audioDoneRef.current &&
                (!needsVideo || videoDoneRef.current) &&
                (!autoTaikoVideoRef.current || taikoDoneRef.current) &&
                !!outDirRef.current;

            if (shouldOpen) {
                openedRef.current = true;
                setBusy(false);
                void openPath(outDirRef.current);
            }
        }).then((fn) => (unlisten = fn));
        return () => unlisten?.();
    }, [appendLog]);

    useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [logLines]);

    return (
        <div className="flex flex-col gap-2 text-zinc-200">
            <Card className="flex items-center gap-2 p-2">
                <div className="flex items-center gap-2 px-3 h-9 rounded-lg bg-[#1f1f1f] border border-[#2a2a2a] w-full max-w-[min(60%,720px)]">
                    <FiLink className="text-[#7b7b7b] flex-shrink-0" />
                    <Input
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder={t("video.urlPlaceholder")}
                        disabled={busy}
                        className="bg-transparent border-0 h-auto px-0 focus:border-0"
                    />
                </div>

                <Select
                    value={audioFormat}
                    onChange={(e) => setAudioFormat(e.target.value as "mp3" | "ogg")}
                    disabled={busy}
                    icon={<FiMusic />}
                    className="min-w-[220px]"
                >
                    <option value="mp3">{t("video.option.mp3")}</option>
                    <option value="ogg">{t("video.option.ogg")}</option>
                </Select>

                <div className="flex-1" />

                <Button
                    variant="secondary"
                    icon={<FiFolder />}
                    onClick={pickDir}
                    disabled={busy}
                    title={t("video.button.folderTitle")}
                >
                    {t("video.button.folder")}
                </Button>

                <Button
                    variant="primary"
                    icon={<FiDownload />}
                    onClick={startDownload}
                    disabled={busy}
                    title={t("video.button.startTitle")}
                >
                    {busy ? t("video.button.working") : t("video.button.start")}
                </Button>
            </Card>

            <Card className="flex items-center gap-2 p-2">
                <Chip
                    icon={<FiFolder />}
                    className="min-w-0 max-w-[min(60%,720px)]"
                    title={outDir || t("video.noFolderSelected")}
                >
                    {outDir || t("video.noFolderSelected")}
                </Chip>

                <Switch
                    checked={includeVideo}
                    onChange={setIncludeVideo}
                    label={t("video.switch.includeVideo")}
                    icon={<FiFilm />}
                    disabled={busy}
                />

                <Switch
                    checked={autoTaikoVideo}
                    onChange={(v) => {
                        if (v && !includeVideo) {
                            appendLog("[ui] enable 'include video' to use auto taiko processing");
                            return;
                        }
                        setAutoTaikoVideo(v);
                    }}
                    label={t("video.switch.autoTaiko")}
                    icon={<FiSliders />}
                    disabled={busy || !includeVideo}
                />

                <div className="flex-1" />

                <Button
                    variant="secondary"
                    icon={<FiSliders />}
                    onClick={runTaikoProcess}
                    disabled={busy || !lastVideoPath}
                    title={t("video.button.taikoTitle")}
                >
                    {t("video.button.taiko")}
                </Button>

                <Button
                    variant="danger"
                    icon={<FiTrash2 />}
                    onClick={clearLog}
                    disabled={busy || logLines.length === 0}
                    title={t("video.button.clearLogTitle")}
                >
                    {t("video.button.clear")}
                </Button>
            </Card>

            <Card className="flex flex-col">
                <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a2a]">
                    <span className="text-sm opacity-80">{t("video.log.title")}</span>
                    <span className="text-xs opacity-60">{formatMeta}</span>
                </div>
                <pre
                    ref={logRef}
                    className="font-mono text-sm whitespace-pre-wrap break-words px-3 py-2 h-[62vh] overflow-auto"
                >
                    {logLines.length > 0 ? logLines.join("\n") : t("video.log.ready")}
                </pre>
            </Card>
        </div>
    );
}
