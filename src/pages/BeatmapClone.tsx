import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FiCopy, FiRefreshCw } from "react-icons/fi";
import { openPath } from "@tauri-apps/plugin-opener";

import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { Input } from "../components/common/Input";
import { Select } from "../components/common/Select";
import { StatusMessage } from "../components/common/StatusMessage";

import { Beatmapset } from "../types/beatmap";
import { useSongsFolder } from "../hooks/useStorage";
import { useI18n } from "../hooks/i18nContext";
import { parseMetadataAndBackground } from "../domain/osu";

interface BeatmapCloneProps {
    selectedBeatmap?: Beatmapset | null;
}

type GameMode = "osu" | "taiko" | "catch" | "mania";

const MODE_VALUES: Record<GameMode, number> = {
    osu: 0,
    taiko: 1,
    catch: 2,
    mania: 3,
};

export function BeatmapClone({ selectedBeatmap }: BeatmapCloneProps) {
    const { t } = useI18n();
    const [songsFolder] = useSongsFolder();

    const [processing, setProcessing] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
    const [loading, setLoading] = useState(false);

    const [gameMode, setGameMode] = useState<GameMode>("taiko");

    const [osuFiles, setOsuFiles] = useState<string[]>([]);
    const [templateOsuFile, setTemplateOsuFile] = useState<string>("");

    const [title, setTitle] = useState("");
    const [titleUnicode, setTitleUnicode] = useState("");
    const [artist, setArtist] = useState("");
    const [artistUnicode, setArtistUnicode] = useState("");
    const [source, setSource] = useState("");
    const [tags, setTags] = useState("");

    const [resetTimingPoints, setResetTimingPoints] = useState(true);
    const [keepKiai, setKeepKiai] = useState(true);
    const [removeSkinFiles, setRemoveSkinFiles] = useState(true);
    const [resetDifficulty, setResetDifficulty] = useState(true);
    const [copyPreviewTime, setCopyPreviewTime] = useState(true);

    const beatmapPath = useMemo(() => {
        if (!songsFolder || !selectedBeatmap) return null;
        return `${songsFolder}\\${selectedBeatmap.folder_name}`;
    }, [songsFolder, selectedBeatmap]);

    const buttonText = useMemo(() => {
        if (processing) return t("clone.button.creating");
        return t("clone.button.create");
    }, [processing, t]);

    const handleGameModeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        setGameMode(e.target.value as GameMode);
    }, []);

    const handleTemplateChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        setTemplateOsuFile(e.target.value);
    }, []);

    const onClone = useCallback(async () => {
        if (!selectedBeatmap) return;

        setProcessing(true);
        setResult(null);

        try {
            if (!songsFolder) {
                throw new Error(t("error.songsFolderNotFound"));
            }

            if (!templateOsuFile) {
                throw new Error(t("clone.sourceOsu.placeholder"));
            }

            const outPath = await invoke<string>("clone_beatmap", {
                config: {
                    sourceBeatmap: selectedBeatmap.folder_name,
                    templateOsuFile,
                    gameMode: MODE_VALUES[gameMode],
                    metadata: {
                        title: title || selectedBeatmap.title,
                        title_unicode: titleUnicode || title || selectedBeatmap.title,
                        artist: artist || selectedBeatmap.artist,
                        artist_unicode: artistUnicode || artist || selectedBeatmap.artist,
                        source: source || "",
                        tags: tags || "",
                    },
                    resetTimingPoints,
                    keepKiai,
                    removeSkinFiles,
                    copyPreviewTime,
                    resetDifficulty,
                    songsFolder,
                },
            });

            let opened = false;
            try {
                await openPath(outPath);
                opened = true;
            } catch (openErr) {
                console.error("Failed to open .osz:", openErr);
            }

            setResult({
                success: true,
                message: opened ? t("clone.result.opened", { path: outPath }) : t("clone.result.saved", { path: outPath }),
            });
        } catch (err) {
            console.error("Clone failed:", err);
            setResult({
                success: false,
                message: t("error.generic", { error: String(err) }),
            });
        } finally {
            setProcessing(false);
        }
    }, [
        selectedBeatmap,
        songsFolder,
        templateOsuFile,
        gameMode,
        title,
        titleUnicode,
        artist,
        artistUnicode,
        source,
        tags,
        resetTimingPoints,
        keepKiai,
        removeSkinFiles,
        copyPreviewTime,
        resetDifficulty,
        t,
    ]);

    useEffect(() => {
        if (!selectedBeatmap || !beatmapPath) return;

        let mounted = true;

        (async () => {
            setLoading(true);
            setOsuFiles([]);
            setTemplateOsuFile("");

            try {
                const files = await invoke<string[]>("list_osu_files", {
                    beatmapFolder: beatmapPath,
                });

                if (!mounted) return;

                setOsuFiles(files);
                setTemplateOsuFile(files[0] ?? "");
            } catch (err) {
                console.error("[Clone] Failed to list .osu files:", err);
            } finally {
                if (mounted) setLoading(false);
            }
        })();

        return () => {
            mounted = false;
        };
    }, [selectedBeatmap, beatmapPath]);

    useEffect(() => {
        if (!beatmapPath || !templateOsuFile) return;

        let mounted = true;

        (async () => {
            setLoading(true);

            try {
                const filePath = `${beatmapPath}\\${templateOsuFile}`;
                const content = await invoke<string>("read_osu_file", { filePath });

                const { metadata } = parseMetadataAndBackground(content);
                if (!mounted) return;
                setTitle(metadata.Title);
                setTitleUnicode(metadata.TitleUnicode);
                setArtist(metadata.Artist);
                setArtistUnicode(metadata.ArtistUnicode);
                setSource(metadata.Source);
                setTags(metadata.Tags);
            } catch (err) {
                console.error("[Clone] Failed to load metadata:", err);
            } finally {
                if (mounted) setLoading(false);
            }
        })();

        return () => {
            mounted = false;
        };
    }, [beatmapPath, templateOsuFile]);

    if (!selectedBeatmap) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center text-text-muted">
                    <div className="text-4xl mb-3 opacity-30">📝</div>
                    <p>{t("clone.empty.selectBeatmap")}</p>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center text-text-muted">
                    <FiRefreshCw className="w-8 h-8 animate-spin mx-auto mb-3" />
                    <p>{t("clone.loading")}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative h-full flex flex-col">
            <div className="flex-1 overflow-y-auto pb-20">
                <div className="max-w-5xl mx-auto space-y-3 p-3">
                    <Card className="p-3">
                        <h2 className="text-lg font-bold mb-1.5">
                            {t("clone.header.clone", { title: title || selectedBeatmap.title })}
                        </h2>
                        <div className="text-xs text-text-muted">
                            {t("clone.header.originalBy", { creator: selectedBeatmap.creator })}
                        </div>
                    </Card>

                    <Card className="p-3">
                        <h3 className="font-semibold text-sm mb-3">{t("clone.section.gameMode")}</h3>
                        <div className="space-y-3">
                            <div>
                                <Select value={gameMode} onChange={handleGameModeChange}>
                                    <option value="osu">osu!</option>
                                    <option value="taiko">osu!taiko</option>
                                    <option value="catch">osu!catch</option>
                                    <option value="mania">osu!mania</option>
                                </Select>
                            </div>

                            <div>
                                <label className="block text-xs text-text-muted mb-1">
                                    {t("clone.sourceOsu.label")}
                                </label>
                                <Select value={templateOsuFile} onChange={handleTemplateChange}>
                                    <option value="">{t("clone.sourceOsu.placeholder")}</option>
                                    {osuFiles.map((f) => (
                                        <option key={f} value={f}>
                                            {f}
                                        </option>
                                    ))}
                                </Select>
                            </div>
                        </div>
                    </Card>

                    <Card className="p-3">
                        <h3 className="font-semibold text-sm mb-3">{t("clone.section.metadata")}</h3>
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-text-muted mb-1">
                                        {t("clone.metadata.titleOriginal")}
                                    </label>
                                    <Input
                                        value={titleUnicode}
                                        onChange={(e) => setTitleUnicode(e.target.value)}
                                        placeholder={t("clone.metadata.titleOriginal")}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-text-muted mb-1">
                                        {t("clone.metadata.titleRomanised")}
                                    </label>
                                    <Input
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder={t("clone.metadata.titleRomanised")}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-text-muted mb-1">
                                        {t("clone.metadata.artistOriginal")}
                                    </label>
                                    <Input
                                        value={artistUnicode}
                                        onChange={(e) => setArtistUnicode(e.target.value)}
                                        placeholder={t("clone.metadata.artistOriginal")}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-text-muted mb-1">
                                        {t("clone.metadata.artistRomanised")}
                                    </label>
                                    <Input
                                        value={artist}
                                        onChange={(e) => setArtist(e.target.value)}
                                        placeholder={t("clone.metadata.artistRomanised")}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-text-muted mb-1">
                                    {t("clone.metadata.source")}
                                </label>
                                <Input
                                    value={source}
                                    onChange={(e) => setSource(e.target.value)}
                                    placeholder={t("clone.metadata.sourcePlaceholder")}
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-text-muted mb-1">{t("clone.metadata.tags")}</label>
                                <textarea
                                    value={tags}
                                    onChange={(e) => setTags(e.target.value)}
                                    placeholder={t("clone.metadata.tagsPlaceholder")}
                                    rows={3}
                                    className="w-full px-3 py-2 rounded-lg bg-surface-input border border-border-muted text-sm text-white placeholder-text-muted focus:outline-none focus:border-border-focus transition-colors resize-none"
                                />
                            </div>
                        </div>
                    </Card>

                    <Card className="p-3">
                        <h3 className="font-semibold text-sm mb-3">{t("clone.section.advanced")}</h3>
                        <div className="space-y-2">
                            <button
                                onClick={() => {
                                    const next = !resetTimingPoints;
                                    setResetTimingPoints(next);
                                    if (!next) {
                                        setKeepKiai(false);
                                    }
                                }}
                                className={`flex flex-col gap-1 px-3 py-2.5 rounded-lg border text-left transition-all duration-200 hover:scale-105 active:scale-95 w-full ${resetTimingPoints
                                    ? "bg-accent-primary/20 border-accent-primary shadow-lg shadow-accent-primary/20"
                                    : "bg-surface-panel border-border-muted"
                                    }`}
                            >
                                <div className="font-medium text-sm">
                                    {t("clone.advanced.keepTimingPoints.title")}
                                </div>
                                <div className="text-xs text-text-muted">
                                    {t("clone.advanced.keepTimingPoints.desc")}
                                </div>
                            </button>

                            <button
                                onClick={() => setKeepKiai(!keepKiai)}
                                disabled={!resetTimingPoints}
                                className={`flex flex-col gap-1 px-3 py-2.5 rounded-lg border text-left transition-all duration-200 w-full ${!resetTimingPoints
                                    ? "bg-surface-panel border-border-muted opacity-50 cursor-not-allowed"
                                    : keepKiai
                                        ? "bg-accent-primary/20 border-accent-primary shadow-lg shadow-accent-primary/20 hover:scale-105 active:scale-95"
                                        : "bg-surface-panel border-border-muted hover:scale-105 active:scale-95"
                                    }`}
                            >
                                <div className="font-medium text-sm">{t("clone.advanced.keepKiai.title")}</div>
                                <div className="text-xs text-text-muted">{t("clone.advanced.keepKiai.desc")}</div>
                            </button>

                            <button
                                onClick={() => setRemoveSkinFiles(!removeSkinFiles)}
                                className={`flex flex-col gap-1 px-3 py-2.5 rounded-lg border text-left transition-all duration-200 hover:scale-105 active:scale-95 w-full ${removeSkinFiles
                                    ? "bg-accent-primary/20 border-accent-primary shadow-lg shadow-accent-primary/20"
                                    : "bg-surface-panel border-border-muted"
                                    }`}
                            >
                                <div className="font-medium text-sm">{t("clone.advanced.removeSkinFiles.title")}</div>
                                <div className="text-xs text-text-muted">
                                    {t("clone.advanced.removeSkinFiles.desc")}
                                </div>
                            </button>

                            <button
                                onClick={() => setResetDifficulty(!resetDifficulty)}
                                className={`flex flex-col gap-1 px-3 py-2.5 rounded-lg border text-left transition-all duration-200 hover:scale-105 active:scale-95 w-full ${resetDifficulty
                                    ? "bg-accent-primary/20 border-accent-primary shadow-lg shadow-accent-primary/20"
                                    : "bg-surface-panel border-border-muted"
                                    }`}
                            >
                                <div className="font-medium text-sm">{t("clone.advanced.resetDifficulty.title")}</div>
                                <div className="text-xs text-text-muted">
                                    HP:5, CS:5, OD:5, AR:5, SliderMultiplier:1.4, SliderTickRate:1
                                </div>
                            </button>

                            <button
                                onClick={() => setCopyPreviewTime(!copyPreviewTime)}
                                className={`flex flex-col gap-1 px-3 py-2.5 rounded-lg border text-left transition-all duration-200 hover:scale-105 active:scale-95 w-full ${copyPreviewTime
                                    ? "bg-accent-primary/20 border-accent-primary shadow-lg shadow-accent-primary/20"
                                    : "bg-surface-panel border-border-muted"
                                    }`}
                            >
                                <div className="font-medium text-sm">{t("clone.advanced.copyPreviewTime.title")}</div>
                                <div className="text-xs text-text-muted">{t("clone.advanced.copyPreviewTime.desc")}</div>
                            </button>
                        </div>
                    </Card>

                    {result && <StatusMessage type={result.success ? "success" : "error"} message={result.message} />}
                </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-3 pt-6">
                <div className="max-w-5xl mx-auto">
                    <Button
                        variant="primary"
                        size="lg"
                        icon={processing ? <FiRefreshCw className="animate-spin" /> : <FiCopy />}
                        onClick={onClone}
                        disabled={processing || !templateOsuFile}
                        className="w-full"
                    >
                        {buttonText}
                    </Button>
                </div>
            </div>
        </div>
    );
}
