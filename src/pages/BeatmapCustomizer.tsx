import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FiCheckCircle, FiAlertCircle, FiRefreshCw, FiChevronDown, FiChevronUp } from "react-icons/fi";
import { readTextFile, writeTextFile, copyFile } from "@tauri-apps/plugin-fs";

import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { Switch } from "../components/common/Switch";

interface BeatmapCustomizerProps {
    selectedBeatmap?: {
        folder_name: string;
        title: string;
        artist: string;
        creator: string;
    };
}

function rewriteCenter(osuText: string, x = 256, y = 192): string {
    const lines = osuText.split(/\r?\n/);
    let inHit = false;
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        if (/^\s*\[HitObjects\]\s*$/i.test(raw)) {
            inHit = true;
            continue;
        }
        if (/^\s*\[[A-Za-z]+\]\s*$/.test(raw)) {
            inHit = false;
            continue;
        }
        if (!inHit) continue;
        const line = raw.trim();
        if (line === "" || line.startsWith("//")) continue;
        const a = line.split(",");
        if (a.length < 5) continue;
        a[0] = String(x);
        a[1] = String(y);
        lines[i] = a.join(",");
    }
    const eol = /\r\n/.test(osuText) ? "\r\n" : "\n";
    return lines.join(eol);
}

function removeEditorBookmarks(osuText: string): string {
    const lines = osuText.split(/\r?\n/);
    let inEditor = false;
    const out: string[] = [];
    for (const raw of lines) {
        if (/^\s*\[Editor\]\s*$/i.test(raw)) {
            inEditor = true;
            out.push(raw);
            continue;
        }
        if (/^\s*\[[A-Za-z]+\]\s*$/.test(raw)) {
            inEditor = false;
            out.push(raw);
            continue;
        }
        if (inEditor && /^\s*Bookmarks\s*:/i.test(raw)) continue;
        out.push(raw);
    }
    const eol = /\r\n/.test(osuText) ? "\r\n" : "\n";
    return out.join(eol);
}

function removeNewComboExceptFirst(osuText: string): string {
    const lines = osuText.split(/\r?\n/);
    let inHit = false;
    let seenFirst = false;
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        if (/^\s*\[HitObjects\]\s*$/i.test(raw)) {
            inHit = true;
            continue;
        }
        if (/^\s*\[[A-Za-z]+\]\s*$/.test(raw)) {
            inHit = false;
            continue;
        }
        if (!inHit) continue;
        const line = raw.trim();
        if (line === "" || line.startsWith("//")) continue;
        const a = line.split(",");
        if (a.length < 4) continue;
        if (!seenFirst) {
            seenFirst = true;
            continue;
        }
        if (a[3] === "5") {
            a[3] = "1";
            lines[i] = a.join(",");
        }
    }
    const eol = /\r\n/.test(osuText) ? "\r\n" : "\n";
    return lines.join(eol);
}

function whistleToClap_2to8(osuText: string): string {
    const lines = osuText.split(/\r?\n/);
    let inHit = false;
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        if (/^\s*\[HitObjects\]\s*$/i.test(raw)) {
            inHit = true;
            continue;
        }
        if (/^\s*\[[A-Za-z]+\]\s*$/.test(raw)) {
            inHit = false;
            continue;
        }
        if (!inHit) continue;
        const line = raw.trim();
        if (line === "" || line.startsWith("//")) continue;
        const a = line.split(",");
        if (a.length < 5) continue;
        if (a[4] === "2") {
            a[4] = "8";
            lines[i] = a.join(",");
        }
        if (a[4] === "6") {
            a[4] = "12";
            lines[i] = a.join(",");
        }
    }
    const eol = /\r\n/.test(osuText) ? "\r\n" : "\n";
    return lines.join(eol);
}

function extractDifficultyName(fileName: string): string {
    const match = fileName.match(/\[(.+)\]\.osu$/);
    return match ? match[1] : fileName.replace('.osu', '');
}

export function BeatmapCustomizer({ selectedBeatmap }: BeatmapCustomizerProps) {
    const [osuFiles, setOsuFiles] = useState<string[]>([]);
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
    const [processing, setProcessing] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
    const [isDiffExpanded, setIsDiffExpanded] = useState(false);

    const [centerOn, setCenterOn] = useState(false);
    const [rmBookmarks, setRmBookmarks] = useState(false);
    const [rmNewCombo, setRmNewCombo] = useState(false);
    const [w2cOn, setW2cOn] = useState(false);
    const [createBackup, setCreateBackup] = useState(true);

    useEffect(() => {
        if (!selectedBeatmap) {
            setOsuFiles([]);
            setSelectedFiles(new Set());
            return;
        }

        (async () => {
            try {
                const songsFolder = localStorage.getItem("songsFolder");
                if (!songsFolder) return;

                const beatmapPath = `${songsFolder}\\${selectedBeatmap.folder_name}`;

                const osuFileList = await invoke<string[]>("list_osu_files", {
                    beatmapFolder: beatmapPath
                });

                setOsuFiles(osuFileList);
                setSelectedFiles(new Set(osuFileList));
                console.log(`Found ${osuFileList.length} .osu files:`, osuFileList);
            } catch (err) {
                console.error("Failed to read beatmap files:", err);
                setOsuFiles([]);
                setSelectedFiles(new Set());
            }
        })();
    }, [selectedBeatmap]);

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
            const songsFolder = localStorage.getItem("songsFolder");
            if (!songsFolder) throw new Error("Songs folder not found");

            const beatmapPath = `${songsFolder}\\${selectedBeatmap.folder_name}`;
            let successCount = 0;

            for (const fileName of selectedFiles) {
                const filePath = `${beatmapPath}\\${fileName}`;

                if (createBackup) {
                    const backupPath = `${filePath}.backup`;
                    try {
                        await copyFile(filePath, backupPath);
                    } catch (err) {
                        console.warn(`Failed to create backup for ${fileName}:`, err);
                    }
                }

                let text = await readTextFile(filePath);

                if (centerOn) text = rewriteCenter(text, 256, 192);
                if (rmBookmarks) text = removeEditorBookmarks(text);
                if (rmNewCombo) text = removeNewComboExceptFirst(text);
                if (w2cOn) text = whistleToClap_2to8(text);

                await writeTextFile(filePath, text);
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
    }, [selectedBeatmap, selectedFiles, centerOn, rmBookmarks, rmNewCombo, w2cOn, createBackup]);

    if (!selectedBeatmap) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center text-[#7b7b7b]">
                    <div className="text-4xl mb-3 opacity-30">📝</div>
                    <p>Select a beatmap to customize</p>
                </div>
            </div>
        );
    }

    const hasChanges = centerOn || rmBookmarks || rmNewCombo || w2cOn;

    return (
        <div className="relative h-full flex flex-col">
            <div className="flex-1 overflow-y-auto pb-20">
                <div className="max-w-5xl mx-auto space-y-3 p-3">
                    <Card className="p-3">
                        <h2 className="text-lg font-bold mb-1.5">{selectedBeatmap.title}</h2>
                        <div className="flex items-end justify-between text-xs text-[#7b7b7b]">
                            <div>Mapped by {selectedBeatmap.creator}</div>
                            <div>{osuFiles.length} difficulty file{osuFiles.length !== 1 ? 's' : ''} found</div>
                        </div>
                    </Card>

                    {osuFiles.length > 0 && (
                        <Card className="overflow-hidden">
                            <button
                                onClick={() => setIsDiffExpanded(!isDiffExpanded)}
                                className="w-full flex items-center justify-between p-3 hover:bg-[#222] transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <h3 className="font-semibold text-sm">Select Difficulties</h3>
                                    <span className="text-xs text-[#7b7b7b]">
                                        ({selectedFiles.size}/{osuFiles.length})
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleAll();
                                        }}
                                        className="h-auto px-0 text-[#2563eb] hover:text-[#1f56cc] hover:bg-transparent"
                                    >
                                        {selectedFiles.size === osuFiles.length ? "Deselect All" : "Select All"}
                                    </Button>
                                    {isDiffExpanded ? (
                                        <FiChevronUp className="text-[#7b7b7b]" />
                                    ) : (
                                        <FiChevronDown className="text-[#7b7b7b]" />
                                    )}
                                </div>
                            </button>

                            {isDiffExpanded && (
                                <div className="p-3 pt-0 border-t border-[#2a2a2a]">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
                                        {osuFiles.map((fileName) => {
                                            const isSelected = selectedFiles.has(fileName);
                                            const diffName = extractDifficultyName(fileName);

                                            return (
                                                <button
                                                    key={fileName}
                                                    onClick={() => toggleFile(fileName)}
                                                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all duration-200 hover:scale-105 active:scale-95 ${isSelected
                                                        ? "bg-[#2563eb]/20 border-[#2563eb] text-white shadow-lg shadow-[#2563eb]/20"
                                                        : "bg-[#171717] border-[#2a2a2a] text-[#e0e0e0]"
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
                                label: "Center objects",
                                desc: "Move all hit objects to center (osu!taiko)",
                                checked: centerOn,
                                set: setCenterOn,
                            },
                            {
                                label: "Remove bookmarks",
                                desc: "Delete all bookmarks (all modes)",
                                checked: rmBookmarks,
                                set: setRmBookmarks,
                            },
                            {
                                label: "Strip new combo flags",
                                desc: "Remove new combo flags (osu!taiko)",
                                checked: rmNewCombo,
                                set: setRmNewCombo,
                            },
                            {
                                label: "Whistle → Clap",
                                desc: "Replace Whistle with Clap (osu!taiko)",
                                checked: w2cOn,
                                set: setW2cOn,
                            },
                        ].map((opt) => (
                            <button
                                key={opt.label}
                                onClick={() => opt.set(!opt.checked)}
                                className={`flex flex-col gap-1 px-3 py-2.5 rounded-lg border text-left transition-all duration-200 hover:scale-105 active:scale-95 ${opt.checked
                                    ? "bg-[#2563eb]/20 border-[#2563eb] shadow-lg shadow-[#2563eb]/20"
                                    : "bg-[#171717] border-[#2a2a2a]"
                                    }`}
                            >
                                <div className="font-medium text-sm">{opt.label}</div>
                                <div className="text-xs text-[#7b7b7b]">{opt.desc}</div>
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
                                <FiCheckCircle className="w-4 h-4 flex-shrink-0" />
                            ) : (
                                <FiAlertCircle className="w-4 h-4 flex-shrink-0" />
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
                        label="Create Backup"
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
                            ? "Processing..."
                            : `Apply to ${selectedFiles.size} Difficult${selectedFiles.size !== 1 ? 'ies' : 'y'}`
                        }
                    </Button>
                </div>
            </div>
        </div>
    );
}