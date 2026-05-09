import { useCallback, useEffect, useState } from "react";
import { FiCheckCircle, FiAlertCircle, FiRefreshCw, FiChevronDown, FiChevronUp } from "react-icons/fi";
import { readTextFile, writeTextFile, copyFile, mkdir, BaseDirectory } from "@tauri-apps/plugin-fs";

import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Switch } from "../components/Switch";

import { useI18n } from "../hooks/i18nContext";
import { useSongsFolder } from "../hooks/useStorage";

import { Beatmapset } from "../types/beatmap";
import { addNewComboToAll, removeEditorBookmarks, removeNewComboExceptFirst, rewriteCenter, whistleToClap_2to8 } from "../domain/osu/textTransform";
import { requestParseBatch, requestFixUnsnaps } from "../utils/signalr";

interface BeatmapCustomizerProps {
    selectedBeatmap?: Beatmapset | null;
}

function extractDifficultyName(fileName: string): string {
    const match = fileName.match(/\[(.+)\]\.osu$/);
    return match ? match[1] : fileName.replace('.osu', '');
}

function extractMetadata(osuText: string): { beatmapId?: string; beatmapSetId?: string } {
    const lines = osuText.split(/\r?\n/);
    let inMetadata = false;
    let beatmapId: string | undefined;
    let beatmapSetId: string | undefined;

    for (const raw of lines) {
        if (/^\s*\[Metadata\]\s*$/i.test(raw)) {
            inMetadata = true;
            continue;
        }
        if (/^\s*\[[A-Za-z]+\]\s*$/.test(raw)) {
            inMetadata = false;
            continue;
        }
        if (!inMetadata) continue;

        const trimmed = raw.trim();
        if (trimmed.startsWith("BeatmapID:")) {
            beatmapId = trimmed.split(":")[1]?.trim();
        } else if (trimmed.startsWith("BeatmapSetID:")) {
            beatmapSetId = trimmed.split(":")[1]?.trim();
        }

        if (beatmapId && beatmapSetId) break;
    }

    return { beatmapId, beatmapSetId };
}

export function BeatmapCustomizer({ selectedBeatmap }: BeatmapCustomizerProps) {
    const { t } = useI18n();
    const [songsFolder] = useSongsFolder();
    const [osuFiles, setOsuFiles] = useState<string[]>([]);
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
    const [processing, setProcessing] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
    const [isDiffExpanded, setIsDiffExpanded] = useState(false);

    const [centerOn, setCenterOn] = useState(false);
    const [rmBookmarks, setRmBookmarks] = useState(false);
    const [rmNewCombo, setRmNewCombo] = useState(false);
    const [addNewCombo, setAddNewCombo] = useState(false);
    const [w2cOn, setW2cOn] = useState(false);
    const [fixUnsnaps, setFixUnsnaps] = useState(false);
    const [createBackup, setCreateBackup] = useState(true);

    useEffect(() => {
        if (!selectedBeatmap) {
            setOsuFiles([]);
            setSelectedFiles(new Set());
            return;
        }

        (async () => {
            try {
                if (!songsFolder) return;

                const beatmapPath = `${songsFolder}\\${selectedBeatmap.folder_name}`;

                const maps = await requestParseBatch(beatmapPath, []);
                const osuFileList = maps.map(m => m.fileName);

                setOsuFiles(osuFileList);
                setSelectedFiles(new Set(osuFileList));
                console.log(`Found ${osuFileList.length} .osu files:`, osuFileList);
            } catch (err) {
                console.error("Failed to read beatmap files:", err);
                setOsuFiles([]);
                setSelectedFiles(new Set());
            }
        })();
    }, [selectedBeatmap, songsFolder]);

    const toggleFile = (fileName: string) => {
        setSelectedFiles(prev => {
            const newSet = new Set(prev);
            if (newSet.has(fileName)) {
                newSet.delete(fileName);
            } else {
                newSet.add(fileName);
            }
            return newSet;
        });
    };

    const toggleAll = () => {
        if (selectedFiles.size === osuFiles.length) {
            setSelectedFiles(new Set());
        } else {
            setSelectedFiles(new Set(osuFiles));
        }
    };

    const onApply = useCallback(async () => {
        if (!selectedBeatmap || selectedFiles.size === 0) return;

        setProcessing(true);
        setResult(null);

        try {
            if (!songsFolder) throw new Error("Songs folder not found");

            const beatmapPath = `${songsFolder}\\${selectedBeatmap.folder_name}`;
            let successCount = 0;

            const now = new Date();
            const timestamp = now.getFullYear().toString() +
                (now.getMonth() + 1).toString().padStart(2, '0') +
                now.getDate().toString().padStart(2, '0') +
                now.getHours().toString().padStart(2, '0') +
                now.getMinutes().toString().padStart(2, '0') +
                now.getSeconds().toString().padStart(2, '0');

            for (const fileName of selectedFiles) {
                const filePath = `${beatmapPath}\\${fileName}`;

                let text = await readTextFile(filePath);

                if (createBackup) {
                    const metadata = extractMetadata(text);

                    if (metadata.beatmapSetId && metadata.beatmapId) {
                        const backupDir = `backup/${metadata.beatmapSetId}/${metadata.beatmapId}`;

                        try {
                            await mkdir(backupDir, {
                                baseDir: BaseDirectory.AppData,
                                recursive: true
                            });
                            const backupPath = `${backupDir}/${timestamp}_${fileName}`;
                            await copyFile(filePath, backupPath, {
                                toPathBaseDir: BaseDirectory.AppData
                            });
                            console.log(`Backup created: ${backupPath}`);
                        } catch (err) {
                            console.warn(`Failed to create backup for ${fileName}:`, err);
                        }
                    } else {
                        console.warn(`Could not extract metadata from ${fileName}, skipping backup`);
                    }
                }

                if (centerOn) text = rewriteCenter(text, 256, 192);
                if (rmBookmarks) text = removeEditorBookmarks(text);
                if (rmNewCombo) text = removeNewComboExceptFirst(text);
                if (addNewCombo) text = addNewComboToAll(text);
                if (w2cOn) text = whistleToClap_2to8(text);

                if (centerOn || rmBookmarks || rmNewCombo || addNewCombo || w2cOn) {
                    await writeTextFile(filePath, text);
                }
                if (fixUnsnaps) {
                    await requestFixUnsnaps(filePath);
                }
                successCount++;
            }

            setResult({
                success: true,
                message: `Successfully processed ${successCount} file${successCount !== 1 ? 's' : ''}`,
            });
        } catch (err) {
            console.error("Processing failed:", err);
            setResult({
                success: false,
                message: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
            });
        } finally {
            setProcessing(false);
        }
    }, [selectedBeatmap, selectedFiles, centerOn, rmBookmarks, rmNewCombo, addNewCombo, w2cOn, fixUnsnaps, createBackup, songsFolder]);

    if (!selectedBeatmap) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center text-text-muted">
                    <div className="text-4xl mb-3 opacity-30">📝</div>
                    <p>{t("customizer.empty.selectBeatmap")}</p>
                </div>
            </div>
        );
    }

    const hasChanges = centerOn || rmBookmarks || rmNewCombo || addNewCombo || w2cOn || fixUnsnaps;

    return (
        <div className="relative h-full flex flex-col">
            <div className="flex-1 overflow-y-auto pb-20">
                <div className="max-w-5xl mx-auto space-y-3 p-3">
                    <Card className="p-3">
                        <h2 className="text-lg font-bold mb-1.5">{selectedBeatmap.title}</h2>
                        <div className="flex items-end justify-between text-xs text-text-muted">
                            <div>{t("mapSelector.mappedBy", { creator: selectedBeatmap.creator })}</div>
                            <div>
                                {t("customizer.header.difficultiesFound", {
                                    count: osuFiles.length,
                                    plural: osuFiles.length === 1 ? "" : "s",
                                })}
                            </div>
                        </div>
                    </Card>

                    {osuFiles.length > 0 && (
                        <Card className="overflow-hidden">
                            <div className="w-full flex items-center justify-between p-3">
                                <button
                                    onClick={() => setIsDiffExpanded(!isDiffExpanded)}
                                    className="flex items-center gap-2 hover:text-text-primary transition-colors"
                                >
                                    <h3 className="font-semibold text-sm">{t("customizer.section.selectDifficulties")}</h3>
                                    <span className="text-xs text-text-muted">
                                        ({selectedFiles.size}/{osuFiles.length})
                                    </span>
                                    {isDiffExpanded ? (
                                        <FiChevronUp className="text-text-muted" />
                                    ) : (
                                        <FiChevronDown className="text-text-muted" />
                                    )}
                                </button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={toggleAll}
                                    className="h-auto px-0 text-accent-primary hover:text-accent-primary-hover hover:bg-transparent"
                                >
                                    {selectedFiles.size === osuFiles.length
                                        ? t("customizer.button.deselectAll")
                                        : t("customizer.button.selectAll")}
                                </Button>
                            </div>

                            {isDiffExpanded && (
                                <div className="p-3 pt-0 border-t border-border-muted">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
                                        {osuFiles.map((fileName) => {
                                            const isSelected = selectedFiles.has(fileName);
                                            const diffName = extractDifficultyName(fileName);

                                            return (
                                                <button
                                                    key={fileName}
                                                    onClick={() => toggleFile(fileName)}
                                                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all duration-200 hover:scale-105 active:scale-95 ${isSelected
                                                        ? "bg-accent-primary/20 border-accent-primary text-white shadow-lg shadow-accent-primary/20"
                                                        : "bg-surface-panel border-border-muted text-text-secondary"
                                                        }`}
                                                >
                                                    {diffName}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </Card>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {[
                            {
                                label: t("customizer.option.center.label"),
                                desc: t("customizer.option.center.desc"),
                                checked: centerOn,
                                set: setCenterOn,
                            },
                            {
                                label: t("customizer.option.bookmarks.label"),
                                desc: t("customizer.option.bookmarks.desc"),
                                checked: rmBookmarks,
                                set: setRmBookmarks,
                            },
                            {
                                label: t("customizer.option.newCombo.label"),
                                desc: t("customizer.option.newCombo.desc"),
                                checked: rmNewCombo,
                                set: setRmNewCombo,
                            },
                            {
                                label: t("customizer.option.whistle.label"),
                                desc: t("customizer.option.whistle.desc"),
                                checked: w2cOn,
                                set: setW2cOn,
                            },
                            {
                                label: t("customizer.option.fixUnsnaps.label"),
                                desc: t("customizer.option.fixUnsnaps.desc"),
                                checked: fixUnsnaps,
                                set: setFixUnsnaps,
                            },
                            {
                                label: t("customizer.option.addNewCombo.label"),
                                desc: t("customizer.option.addNewCombo.desc"),
                                checked: addNewCombo,
                                set: setAddNewCombo,
                            },
                        ].map((opt) => (
                            <button
                                key={opt.label}
                                onClick={() => opt.set(!opt.checked)}
                                className={`flex flex-col gap-1 px-3 py-2.5 rounded-lg border text-left transition-all duration-200 hover:scale-105 active:scale-95 ${opt.checked
                                    ? "bg-accent-primary/20 border-accent-primary shadow-lg shadow-accent-primary/20"
                                    : "bg-surface-panel border-border-muted"
                                    }`}
                            >
                                <div className="font-medium text-sm">{opt.label}</div>
                                <div className="text-xs text-text-muted">{opt.desc}</div>
                            </button>
                        ))}
                    </div>

                    {result && (
                        <Card
                            className={`flex items-center gap-2.5 px-3 py-2.5 ${result.success
                                ? "bg-green-500/10 border-green-500/30 text-green-400"
                                : "bg-red-500/10 border-red-500/30 text-red-400"
                                }`}
                        >
                            {result.success ? (
                                <FiCheckCircle className="w-4 h-4 shrink-0" />
                            ) : (
                                <FiAlertCircle className="w-4 h-4 shrink-0" />
                            )}
                            <span className="text-sm">{result.message}</span>
                        </Card>
                    )}
                </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-3 pt-6">
                <div className="max-w-5xl mx-auto flex items-center gap-3">
                    <Switch
                        checked={createBackup}
                        onChange={setCreateBackup}
                        className="h-11 px-2"
                        label={t("customizer.backup.label")}
                    />

                    <Button
                        variant="primary"
                        size="lg"
                        icon={processing ? <FiRefreshCw className="animate-spin" /> : undefined}
                        onClick={onApply}
                        disabled={!hasChanges || processing || selectedFiles.size === 0}
                        className="flex-1"
                    >
                        {processing
                            ? t("customizer.button.processing")
                            : t("customizer.button.apply", {
                                count: selectedFiles.size,
                                plural: selectedFiles.size === 1 ? "y" : "ies",
                            })
                        }
                    </Button>
                </div>
            </div>
        </div>
    );
}
