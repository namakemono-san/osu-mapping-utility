import { useCallback, useEffect, useState, useMemo } from "react";
import { FiRefreshCw, FiSave, FiFileText, FiImage } from "react-icons/fi";

import { invoke } from "@tauri-apps/api/core";

import { Card } from "../components/common/Card";
import { Input } from "../components/common/Input";
import { Modal } from "../components/common/Modal";
import { Button } from "../components/common/Button";
import { StatusMessage } from "../components/common/StatusMessage";

import { Beatmapset } from "../types/beatmap";

interface MetadataEditorProps {
    selectedBeatmap?: Beatmapset | null;
}

interface Metadata {
    Title: string;
    TitleUnicode: string;
    Artist: string;
    ArtistUnicode: string;
    Creator: string;
    Version: string;
    Source: string;
    Tags: string;
}

interface BackgroundData {
    filename: string;
    xOffset: number;
    yOffset: number;
}

interface FileMetadata {
    filename: string;
    metadata: Metadata;
    background: BackgroundData;
}

type ConflictField = keyof Omit<Metadata, "Version">;

interface Conflict {
    field: ConflictField;
    values: Map<string, string[]>;
}

const FIELD_LABELS: Record<ConflictField, string> = {
    Title: "Title",
    TitleUnicode: "Title (Unicode)",
    Artist: "Artist",
    ArtistUnicode: "Artist (Unicode)",
    Creator: "Creator",
    Source: "Source",
    Tags: "Tags",
};

export function MetadataEditor({ selectedBeatmap }: MetadataEditorProps) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [files, setFiles] = useState<FileMetadata[]>([]);
    const [conflicts, setConflicts] = useState<Conflict[]>([]);
    const [mergedData, setMergedData] = useState<Omit<Metadata, "Version">>({
        Title: "",
        TitleUnicode: "",
        Artist: "",
        ArtistUnicode: "",
        Creator: "",
        Source: "",
        Tags: "",
    });
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

    const [bgModalOpen, setBgModalOpen] = useState(false);
    const [editingBgIndex, setEditingBgIndex] = useState<number | null>(null);
    const [tempBgData, setTempBgData] = useState<BackgroundData>({
        filename: "",
        xOffset: 0,
        yOffset: 0,
    });

    const parseMetadata = useCallback(
        (content: string): { metadata: Metadata; background: BackgroundData } => {
            const lines = content.split(/\r?\n/);
            const metadata: Metadata = {
                Title: "",
                TitleUnicode: "",
                Artist: "",
                ArtistUnicode: "",
                Creator: "",
                Version: "",
                Source: "",
                Tags: "",
            };
            const background: BackgroundData = {
                filename: "",
                xOffset: 0,
                yOffset: 0,
            };

            let inMetadata = false;
            let inEvents = false;

            for (const line of lines) {
                const trimmed = line.trim();

                if (/^\[Metadata\]$/i.test(trimmed)) {
                    inMetadata = true;
                    inEvents = false;
                    continue;
                }

                if (/^\[Events\]$/i.test(trimmed)) {
                    inEvents = true;
                    inMetadata = false;
                    continue;
                }

                if (/^\[[A-Za-z]+\]$/.test(trimmed)) {
                    inMetadata = false;
                    inEvents = false;
                    continue;
                }

                if (inMetadata && trimmed && !trimmed.startsWith("//")) {
                    const colonIndex = trimmed.indexOf(":");
                    if (colonIndex !== -1) {
                        const key = trimmed.substring(0, colonIndex).trim() as keyof Metadata;
                        const value = trimmed.substring(colonIndex + 1).trim();
                        if (key in metadata) {
                            metadata[key] = value;
                        }
                    }
                }

                if (inEvents && trimmed && !trimmed.startsWith("//")) {
                    if (trimmed.startsWith("0,0,")) {
                        const match = trimmed.match(/0,0,"([^"]+)",(-?\d+),(-?\d+)/);
                        if (match) {
                            background.filename = match[1];
                            background.xOffset = parseInt(match[2], 10);
                            background.yOffset = parseInt(match[3], 10);
                        }
                    }
                }
            }

            return { metadata, background };
        },
        []
    );

    const detectConflicts = useCallback((filesData: FileMetadata[]): Conflict[] => {
        const conflicts: Conflict[] = [];
        const fields: ConflictField[] = [
            "Title",
            "TitleUnicode",
            "Artist",
            "ArtistUnicode",
            "Creator",
            "Source",
            "Tags",
        ];

        for (const field of fields) {
            const valueMap = new Map<string, string[]>();

            for (const file of filesData) {
                const value = file.metadata[field];
                if (!valueMap.has(value)) {
                    valueMap.set(value, []);
                }
                valueMap.get(value)!.push(file.filename);
            }

            if (valueMap.size > 1) {
                conflicts.push({ field, values: valueMap });
            }
        }

        return conflicts;
    }, []);

    const openBgModal = useCallback(
        (index: number) => {
            setEditingBgIndex(index);
            setTempBgData({ ...files[index].background });
            setBgModalOpen(true);
        },
        [files]
    );

    const closeBgModal = useCallback(() => {
        setBgModalOpen(false);
        setEditingBgIndex(null);
    }, []);

    const saveBgChanges = useCallback(() => {
        if (editingBgIndex === null) return;

        setFiles((prev) => {
            const updated = [...prev];
            updated[editingBgIndex].background = { ...tempBgData };
            return updated;
        });
        closeBgModal();
    }, [editingBgIndex, tempBgData, closeBgModal]);

    const applyBgToAll = useCallback(() => {
        setFiles((prev) =>
            prev.map((file) => ({
                ...file,
                background: { ...tempBgData },
            }))
        );
        closeBgModal();
    }, [tempBgData, closeBgModal]);

    const handleSave = useCallback(async () => {
        if (!selectedBeatmap || files.length === 0) return;

        setSaving(true);
        setResult(null);

        try {
            const songsFolder = localStorage.getItem("songsFolder");
            if (!songsFolder) {
                throw new Error("Songs folder not found");
            }

            const beatmapPath = `${songsFolder}\\${selectedBeatmap.folder_name}`;

            for (const file of files) {
                const filePath = `${beatmapPath}\\${file.filename}`;
                const content = await invoke<string>("read_osu_file", { filePath });

                const lines = content.split(/\r?\n/);
                let inMetadata = false;
                let inEvents = false;
                const output: string[] = [];

                for (const line of lines) {
                    const trimmed = line.trim();

                    if (/^\[Metadata\]$/i.test(trimmed)) {
                        inMetadata = true;
                        inEvents = false;
                        output.push(line);
                        continue;
                    }

                    if (/^\[Events\]$/i.test(trimmed)) {
                        inEvents = true;
                        inMetadata = false;
                        output.push(line);
                        continue;
                    }

                    if (/^\[[A-Za-z]+\]$/.test(trimmed)) {
                        inMetadata = false;
                        inEvents = false;
                        output.push(line);
                        continue;
                    }

                    if (inMetadata && trimmed && !trimmed.startsWith("//")) {
                        const colonIndex = trimmed.indexOf(":");
                        if (colonIndex !== -1) {
                            const key = trimmed.substring(0, colonIndex).trim() as ConflictField;
                            if (key in mergedData) {
                                output.push(`${key}:${mergedData[key]}`);
                                continue;
                            }
                        }
                    }

                    if (inEvents && trimmed.startsWith("0,0,")) {
                        const bg = file.background;
                        output.push(`0,0,"${bg.filename}",${bg.xOffset},${bg.yOffset}`);
                        continue;
                    }

                    output.push(line);
                }

                const eol = /\r\n/.test(content) ? "\r\n" : "\n";
                const newContent = output.join(eol);
                await invoke("write_osu_file", { filePath, content: newContent });
            }

            setResult({
                success: true,
                message: `Successfully saved ${files.length} file${files.length !== 1 ? "s" : ""}`,
            });
        } catch (err) {
            console.error("Save failed:", err);
            setResult({
                success: false,
                message: `Error: ${err}`,
            });
        } finally {
            setSaving(false);
        }
    }, [selectedBeatmap, files, mergedData]);

    const saveButtonText = useMemo(() => {
        if (saving) return "Saving...";
        return `Save to ${files.length} File${files.length !== 1 ? "s" : ""}`;
    }, [saving, files.length]);

    useEffect(() => {
        if (!selectedBeatmap) return;

        let mounted = true;

        (async () => {
            setLoading(true);
            setResult(null);
            try {
                const songsFolder = localStorage.getItem("songsFolder");
                if (!songsFolder) {
                    throw new Error("Songs folder not found");
                }

                const beatmapPath = `${songsFolder}\\${selectedBeatmap.folder_name}`;
                const osuFiles = await invoke<string[]>("list_osu_files", {
                    beatmapFolder: beatmapPath,
                });

                if (osuFiles.length === 0) {
                    throw new Error("No .osu files found");
                }

                const filesData: FileMetadata[] = [];

                for (const filename of osuFiles) {
                    const filePath = `${beatmapPath}\\${filename}`;
                    const content = await invoke<string>("read_osu_file", { filePath });
                    const { metadata, background } = parseMetadata(content);
                    filesData.push({ filename, metadata, background });
                }

                if (!mounted) return;

                setFiles(filesData);

                const detectedConflicts = detectConflicts(filesData);
                setConflicts(detectedConflicts);

                if (detectedConflicts.length === 0) {
                    const { Version, ...rest } = filesData[0].metadata;
                    setMergedData(rest);
                } else {
                    const { Version, ...rest } = filesData[0].metadata;
                    const initialData = { ...rest };
                    for (const conflict of detectedConflicts) {
                        const mostCommon = Array.from(conflict.values.entries()).sort(
                            (a, b) => b[1].length - a[1].length
                        )[0][0];
                        initialData[conflict.field] = mostCommon;
                    }
                    setMergedData(initialData);
                }
            } catch (err) {
                console.error("Failed to load metadata:", err);
                if (mounted) {
                    setResult({
                        success: false,
                        message: `Error: ${err}`,
                    });
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        })();

        return () => {
            mounted = false;
        };
    }, [selectedBeatmap, parseMetadata, detectConflicts]);

    if (!selectedBeatmap) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center text-[#7b7b7b]">
                    <div className="text-4xl mb-3 opacity-30">📝</div>
                    <p>Select a beatmap to edit metadata</p>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center text-[#7b7b7b]">
                    <FiRefreshCw className="w-8 h-8 animate-spin mx-auto mb-3" />
                    <p>Loading metadata...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative h-full flex flex-col">
            <div className="flex-1 overflow-y-auto pb-20">
                <div className="max-w-5xl mx-auto space-y-3 p-3">
                    <Card className="p-3">
                        <h2 className="text-lg font-bold mb-1.5">{selectedBeatmap.title}</h2>
                        <div className="flex items-center gap-2 text-xs text-[#7b7b7b]">
                            <FiFileText className="w-3 h-3" />
                            <span>
                                {files.length} file{files.length !== 1 ? "s" : ""} loaded
                            </span>
                            {conflicts.length > 0 && (
                                <span className="text-yellow-500">
                                    • {conflicts.length} conflict{conflicts.length !== 1 ? "s" : ""}{" "}
                                    detected
                                </span>
                            )}
                        </div>
                    </Card>

                    <Card className="p-3">
                        <h3 className="font-semibold text-sm mb-3">Metadata</h3>
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-[#7b7b7b] mb-1">
                                        Title
                                    </label>
                                    <Input
                                        value={mergedData.Title}
                                        onChange={(e) =>
                                            setMergedData({ ...mergedData, Title: e.target.value })
                                        }
                                        placeholder="Title"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-[#7b7b7b] mb-1">
                                        Title (Unicode)
                                    </label>
                                    <Input
                                        value={mergedData.TitleUnicode}
                                        onChange={(e) =>
                                            setMergedData({
                                                ...mergedData,
                                                TitleUnicode: e.target.value,
                                            })
                                        }
                                        placeholder="Title Unicode"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-[#7b7b7b] mb-1">
                                        Artist
                                    </label>
                                    <Input
                                        value={mergedData.Artist}
                                        onChange={(e) =>
                                            setMergedData({
                                                ...mergedData,
                                                Artist: e.target.value,
                                            })
                                        }
                                        placeholder="Artist"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-[#7b7b7b] mb-1">
                                        Artist (Unicode)
                                    </label>
                                    <Input
                                        value={mergedData.ArtistUnicode}
                                        onChange={(e) =>
                                            setMergedData({
                                                ...mergedData,
                                                ArtistUnicode: e.target.value,
                                            })
                                        }
                                        placeholder="Artist Unicode"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-[#7b7b7b] mb-1">
                                    Creator
                                </label>
                                <Input
                                    value={mergedData.Creator}
                                    onChange={(e) =>
                                        setMergedData({ ...mergedData, Creator: e.target.value })
                                    }
                                    placeholder="Creator"
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-[#7b7b7b] mb-1">Source</label>
                                <Input
                                    value={mergedData.Source}
                                    onChange={(e) =>
                                        setMergedData({ ...mergedData, Source: e.target.value })
                                    }
                                    placeholder="Source (optional)"
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-[#7b7b7b] mb-1">Tags</label>
                                <textarea
                                    value={mergedData.Tags}
                                    onChange={(e) =>
                                        setMergedData({ ...mergedData, Tags: e.target.value })
                                    }
                                    placeholder="Space-separated tags"
                                    rows={3}
                                    className="w-full px-3 py-2 rounded-lg bg-[#101010] border border-[#2a2a2a] text-sm text-white placeholder-[#7b7b7b] focus:outline-none focus:border-[#4a4a4a] transition-colors resize-none"
                                />
                            </div>
                        </div>

                        {conflicts.length > 0 && (
                            <div className="mt-4 p-3 rounded-lg bg-[#171717] border border-[#2a2a2a]">
                                <div className="text-xs font-semibold text-[#7b7b7b] mb-2">
                                    Conflict Details:
                                </div>
                                <div className="space-y-2 text-xs">
                                    {conflicts.map((conflict) => (
                                        <div key={conflict.field} className="space-y-1">
                                            <div className="text-[#e0e0e0] font-medium">
                                                {FIELD_LABELS[conflict.field]}:
                                            </div>
                                            {Array.from(conflict.values.entries()).map(
                                                ([value, filenames]) => (
                                                    <button
                                                        key={value}
                                                        onClick={() =>
                                                            setMergedData({
                                                                ...mergedData,
                                                                [conflict.field]: value,
                                                            })
                                                        }
                                                        className={`block w-full text-left px-2 py-1.5 rounded border transition-colors ${mergedData[conflict.field] === value
                                                            ? "bg-[#2563eb]/20 border-[#2563eb] text-white"
                                                            : "bg-[#101010] border-[#2a2a2a] text-[#7b7b7b] hover:border-[#4a4a4a]"
                                                            }`}
                                                    >
                                                        <div className="font-mono">
                                                            "{value || "(empty)"}"
                                                        </div>
                                                        <div className="text-[10px] opacity-60 mt-0.5">
                                                            {filenames.join(", ")}
                                                        </div>
                                                    </button>
                                                )
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </Card>

                    <Card className="p-3">
                        <div className="flex items-center gap-2 mb-3">
                            <FiImage className="w-4 h-4 text-[#7b7b7b]" />
                            <h3 className="font-semibold text-sm">Background Settings</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {files.map((file, index) => (
                                <button
                                    key={index}
                                    onClick={() => openBgModal(index)}
                                    className="px-3 py-2.5 rounded-lg border border-[#2a2a2a] bg-[#171717] hover:border-[#4a4a4a] transition-all text-left"
                                >
                                    <div className="text-xs font-semibold text-white mb-1 truncate">
                                        {file.metadata.Version}
                                    </div>
                                    <div className="text-[10px] text-[#7b7b7b] space-y-0.5">
                                        <div className="truncate">
                                            {file.background.filename || "(no background)"}, Offset:
                                            ({file.background.xOffset}, {file.background.yOffset})
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </Card>

                    {result && (
                        <StatusMessage
                            type={result.success ? "success" : "error"}
                            message={result.message}
                        />
                    )}
                </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-3 pt-6">
                <div className="max-w-5xl mx-auto">
                    <Button
                        variant="primary"
                        size="lg"
                        icon={saving ? <FiRefreshCw className="animate-spin" /> : <FiSave />}
                        onClick={handleSave}
                        disabled={saving || files.length === 0}
                        className="w-full"
                    >
                        {saveButtonText}
                    </Button>
                </div>
            </div>

            {bgModalOpen && editingBgIndex !== null && (
                <Modal
                    isOpen={true}
                    onClose={closeBgModal}
                    title={`Edit Background: ${files[editingBgIndex].metadata.Version}`}
                >
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs text-[#7b7b7b] mb-1">
                                Background Filename
                            </label>
                            <Input
                                value={tempBgData.filename}
                                onChange={(e) =>
                                    setTempBgData({ ...tempBgData, filename: e.target.value })
                                }
                                placeholder="bg.jpg"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-[#7b7b7b] mb-1">
                                    X Offset
                                </label>
                                <Input
                                    type="number"
                                    value={tempBgData.xOffset}
                                    onChange={(e) =>
                                        setTempBgData({
                                            ...tempBgData,
                                            xOffset: parseInt(e.target.value) || 0,
                                        })
                                    }
                                    placeholder="0"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-[#7b7b7b] mb-1">
                                    Y Offset
                                </label>
                                <Input
                                    type="number"
                                    value={tempBgData.yOffset}
                                    onChange={(e) =>
                                        setTempBgData({
                                            ...tempBgData,
                                            yOffset: parseInt(e.target.value) || 0,
                                        })
                                    }
                                    placeholder="0"
                                />
                            </div>
                        </div>

                        <div className="pt-2 space-y-2">
                            <Button
                                variant="primary"
                                size="md"
                                onClick={saveBgChanges}
                                className="w-full"
                            >
                                Save Changes
                            </Button>
                            <Button
                                variant="secondary"
                                size="md"
                                onClick={applyBgToAll}
                                className="w-full"
                            >
                                Apply to All Difficulties
                            </Button>
                            <Button
                                variant="ghost"
                                size="md"
                                onClick={closeBgModal}
                                className="w-full"
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}