import { useCallback, useEffect, useState, useMemo } from "react";
import { FiRefreshCw, FiSave, FiFileText, FiImage } from "react-icons/fi";

import { Card } from "../components/common/Card";
import { Input } from "../components/common/Input";
import { Modal } from "../components/common/Modal";
import { Button } from "../components/common/Button";
import { StatusMessage } from "../components/common/StatusMessage";

import { Beatmapset } from "../types/beatmap";
import { useSongsFolder } from "../hooks/useStorage";
import { useI18n } from "../hooks/i18nContext";
import type { LocaleKey } from "../locale";
import {
    buildOsuFilename,
    makeUniqueOsuFilename,
    osuApi,
} from "../domain/osu";
import type { OsuBackground, OsuMetadata, MetadataWriteInput } from "../domain/osu/types";

interface MetadataEditorProps {
    selectedBeatmap?: Beatmapset | null;
}

interface FileMetadata {
    filename: string;
    metadata: OsuMetadata;
    background: OsuBackground;
}

type ConflictField = keyof Omit<OsuMetadata, "version" | "beatmapId" | "beatmapSetId">;

interface Conflict {
    field: ConflictField;
    values: Map<string, string[]>;
}

const FIELD_LABELS: Record<ConflictField, LocaleKey> = {
    title: "metadata.label.romanisedTitle",
    titleUnicode: "metadata.label.title",
    artist: "metadata.label.romanisedArtist",
    artistUnicode: "metadata.label.artist",
    creator: "metadata.label.creator",
    source: "metadata.label.source",
    tags: "metadata.label.tags",
};

export function MetadataEditor({ selectedBeatmap }: MetadataEditorProps) {
    const { t } = useI18n();
    const [songsFolder] = useSongsFolder();

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [files, setFiles] = useState<FileMetadata[]>([]);
    const [conflicts, setConflicts] = useState<Conflict[]>([]);
    const [mergedData, setMergedData] = useState<Omit<OsuMetadata, "version" | "beatmapId" | "beatmapSetId">>({
        title: "",
        titleUnicode: "",
        artist: "",
        artistUnicode: "",
        creator: "",
        source: "",
        tags: "",
    });
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

    const [bgModalOpen, setBgModalOpen] = useState(false);
    const [editingBgIndex, setEditingBgIndex] = useState<number | null>(null);
    const [tempBgData, setTempBgData] = useState<OsuBackground>({
        filename: "",
        xOffset: 0,
        yOffset: 0,
    });

    const detectConflicts = useCallback((filesData: FileMetadata[]): Conflict[] => {
        const conflicts: Conflict[] = [];
        const fields: ConflictField[] = [
            "title",
            "titleUnicode",
            "artist",
            "artistUnicode",
            "creator",
            "source",
            "tags",
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

    const isAsciiPrintable = useCallback((s: string) => {
        return /^[\x20-\x7E]*$/.test(s);
    }, []);

    const romanisedArtistDisabled = useMemo(() => {
        const a = mergedData.artistUnicode;
        return a.length > 0 && isAsciiPrintable(a) && a === mergedData.artist;
    }, [mergedData.artistUnicode, mergedData.artist, isAsciiPrintable]);

    const filenamePlan = useMemo(() => {
        const used = new Set<string>();
        const planned = new Map<string, string>();

        for (const file of files) {
            const desired = buildOsuFilename({
                artist: mergedData.artist,
                title: mergedData.title,
                creator: mergedData.creator,
                difficulty: file.metadata.version,
            });
            const unique = makeUniqueOsuFilename(desired, used);
            planned.set(file.filename, unique);
        }

        const renames = files
            .map((f) => ({ from: f.filename, to: planned.get(f.filename) ?? f.filename }))
            .filter((op) => op.from !== op.to);

        return { planned, renames };
    }, [files, mergedData.artist, mergedData.title, mergedData.creator]);

    const showFilenamePreview = filenamePlan.renames.length > 0;

    const handleSave = useCallback(async () => {
        if (!selectedBeatmap || files.length === 0) return;

        setSaving(true);
        setResult(null);

        try {
            if (!songsFolder) {
                throw new Error(t("error.songsFolderNotFound"));
            }

            const beatmapPath = `${songsFolder}\\${selectedBeatmap.folder_name}`;

            for (const file of files) {
                const filePath = `${beatmapPath}\\${file.filename}`;
                const metadata: MetadataWriteInput = {
                    title: mergedData.title,
                    titleUnicode: mergedData.titleUnicode,
                    artist: mergedData.artist,
                    artistUnicode: mergedData.artistUnicode,
                    creator: mergedData.creator,
                    source: mergedData.source,
                    tags: mergedData.tags,
                };
                await osuApi.writeOsuMetadata(filePath, metadata, file.background);
            }

            if (filenamePlan.renames.length > 0) {
                await osuApi.renameOsuFiles(beatmapPath, filenamePlan.renames);
                setFiles((prev) =>
                    prev.map((f) => ({
                        ...f,
                        filename: filenamePlan.planned.get(f.filename) ?? f.filename,
                    }))
                );
            }

            setResult({
                success: true,
                message: t("metadata.save.success", {
                    count: files.length,
                    plural: files.length === 1 ? "" : "s",
                }),
            });
        } catch (err) {
            console.error("Save failed:", err);
            setResult({
                success: false,
                message: t("error.generic", { error: String(err) }),
            });
        } finally {
            setSaving(false);
        }
    }, [selectedBeatmap, files, mergedData, songsFolder, filenamePlan, t]);

    const saveButtonText = useMemo(() => {
        if (saving) return t("metadata.save.saving");
        return t("metadata.save.button", {
            count: files.length,
            plural: files.length === 1 ? "" : "s",
        });
    }, [saving, files.length, t]);

    useEffect(() => {
        if (!selectedBeatmap) return;

        let mounted = true;

        (async () => {
            setLoading(true);
            setResult(null);
            try {
                if (!songsFolder) {
                    throw new Error(t("error.songsFolderNotFound"));
                }

                const beatmapPath = `${songsFolder}\\${selectedBeatmap.folder_name}`;
                const osuFiles = await osuApi.listOsuFiles(beatmapPath);

                if (osuFiles.length === 0) {
                    throw new Error(t("metadata.error.noOsu"));
                }

                const filesData: FileMetadata[] = [];

                for (const filename of osuFiles) {
                    const filePath = `${beatmapPath}\\${filename}`;
                    const beatmap = await osuApi.parseOsuFile(filePath);
                    const background: OsuBackground = beatmap.background ?? { filename: "", xOffset: 0, yOffset: 0 };
                    filesData.push({ filename, metadata: beatmap.metadata, background });
                }

                if (!mounted) return;

                setFiles(filesData);

                const detectedConflicts = detectConflicts(filesData);
                setConflicts(detectedConflicts);

                if (detectedConflicts.length === 0) {
                    const { version: _v, beatmapId: _bi, beatmapSetId: _bsi, ...rest } = filesData[0].metadata;
                    setMergedData(rest);
                } else {
                    const { version: _v, beatmapId: _bi, beatmapSetId: _bsi, ...rest } = filesData[0].metadata;
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
                        message: t("metadata.error.load", { error: String(err) }),
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
    }, [selectedBeatmap, songsFolder, detectConflicts, t]);

    if (!selectedBeatmap) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center text-[#7b7b7b]">
                    <div className="text-4xl mb-3 opacity-30">📝</div>
                    <p>{t("metadata.empty.selectBeatmap")}</p>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center text-[#7b7b7b]">
                    <FiRefreshCw className="w-8 h-8 animate-spin mx-auto mb-3" />
                    <p>{t("metadata.loading")}</p>
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
                                {t("metadata.header.filesLoaded", {
                                    count: files.length,
                                    plural: files.length !== 1 ? "s" : "",
                                })}
                            </span>
                            {conflicts.length > 0 && (
                                <span className="text-yellow-500">
                                    {t("metadata.header.conflictsDetected", {
                                        count: conflicts.length,
                                        plural: conflicts.length !== 1 ? "s" : "",
                                    })}
                                </span>
                            )}
                        </div>
                    </Card>

                    <Card className="p-3">
                        <h3 className="font-semibold text-sm mb-3">{t("metadata.section.metadata")}</h3>
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-[#7b7b7b] mb-1">
                                        {t("metadata.label.title")}
                                    </label>
                                    <Input
                                        value={mergedData.titleUnicode}
                                        onChange={(e) =>
                                            setMergedData({
                                                ...mergedData,
                                                titleUnicode: e.target.value,
                                            })
                                        }
                                        placeholder={t("metadata.placeholder.title")}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-[#7b7b7b] mb-1">
                                        {t("metadata.label.romanisedTitle")}
                                    </label>
                                    <Input
                                        value={mergedData.title}
                                        onChange={(e) =>
                                            setMergedData({
                                                ...mergedData,
                                                title: e.target.value,
                                            })
                                        }
                                        placeholder={t("metadata.placeholder.romanisedTitle")}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-[#7b7b7b] mb-1">
                                        {t("metadata.label.artist")}
                                    </label>
                                    <Input
                                        value={mergedData.artistUnicode}
                                        onChange={(e) =>
                                            setMergedData((prev) => {
                                                const v = e.target.value;
                                                if (isAsciiPrintable(v)) {
                                                    return { ...prev, artistUnicode: v, artist: v };
                                                }
                                                return { ...prev, artistUnicode: v };
                                            })
                                        }
                                        placeholder={t("metadata.placeholder.artist")}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-[#7b7b7b] mb-1">
                                        {t("metadata.label.romanisedArtist")}
                                    </label>
                                    <Input
                                        value={mergedData.artist}
                                        onChange={(e) =>
                                            setMergedData({
                                                ...mergedData,
                                                artist: e.target.value,
                                            })
                                        }
                                        placeholder={t("metadata.placeholder.romanisedArtist")}
                                        disabled={romanisedArtistDisabled}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-[#7b7b7b] mb-1">
                                    {t("metadata.label.creator")}
                                </label>
                                <Input
                                    value={mergedData.creator}
                                    onChange={(e) =>
                                        setMergedData({ ...mergedData, creator: e.target.value })
                                    }
                                    placeholder={t("metadata.placeholder.creator")}
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-[#7b7b7b] mb-1">{t("metadata.label.source")}</label>
                                <Input
                                    value={mergedData.source}
                                    onChange={(e) =>
                                        setMergedData({ ...mergedData, source: e.target.value })
                                    }
                                    placeholder={t("metadata.placeholder.source")}
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-[#7b7b7b] mb-1">{t("metadata.label.tags")}</label>
                                <textarea
                                    value={mergedData.tags}
                                    onChange={(e) =>
                                        setMergedData({ ...mergedData, tags: e.target.value })
                                    }
                                    placeholder={t("metadata.placeholder.tags")}
                                    rows={3}
                                    className="w-full px-3 py-2 rounded-lg bg-[#101010] border border-[#2a2a2a] text-sm text-white placeholder-[#7b7b7b] focus:outline-none focus:border-[#4a4a4a] transition-colors resize-none"
                                />
                            </div>
                        </div>

                        {conflicts.length > 0 && (
                            <div className="mt-4 p-3 rounded-lg bg-[#171717] border border-[#2a2a2a]">
                                <div className="text-xs font-semibold text-[#7b7b7b] mb-2">
                                    {t("metadata.conflicts.details")}
                                </div>
                                <div className="space-y-2 text-xs">
                                    {conflicts.map((conflict) => (
                                        <div key={conflict.field} className="space-y-1">
                                            <div className="text-[#e0e0e0] font-medium">
                                                {t(FIELD_LABELS[conflict.field])}:
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

                    {showFilenamePreview && (
                        <Card className="p-3">
                            <h3 className="font-semibold text-sm mb-3">{t("metadata.filenamePreview.title")}</h3>
                            <div className="space-y-2">
                                {files.map((file) => {
                                    const next = filenamePlan.planned.get(file.filename) ?? file.filename;
                                    const changed = next !== file.filename;
                                    if (!changed) return null;

                                    return (
                                        <div
                                            key={file.filename}
                                            className="rounded-lg border px-3 py-2.5 bg-[#2563eb]/10 border-[#2563eb]/40"
                                        >
                                            <div className="text-xs font-semibold text-white mb-1 truncate">
                                                {file.metadata.version}
                                            </div>
                                            <div className="text-[11px] text-[#7b7b7b] font-mono break-all">
                                                {t("metadata.filenamePreview.old")} {file.filename}
                                            </div>
                                            <div className="text-[11px] text-[#e0e0e0] font-mono break-all mt-1">
                                                {t("metadata.filenamePreview.new")} {next}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>
                    )}

                    <Card className="p-3">
                        <div className="flex items-center gap-2 mb-3">
                            <FiImage className="w-4 h-4 text-[#7b7b7b]" />
                            <h3 className="font-semibold text-sm">{t("metadata.background.title")}</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {files.map((file, index) => (
                                <button
                                    key={index}
                                    onClick={() => openBgModal(index)}
                                    className="px-3 py-2.5 rounded-lg border border-[#2a2a2a] bg-[#171717] hover:border-[#4a4a4a] transition-all text-left"
                                >
                                    <div className="text-xs font-semibold text-white mb-1 truncate">
                                        {file.metadata.version}
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
                    title={t("metadata.background.modalTitle", { version: files[editingBgIndex].metadata.version })}
                >
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs text-[#7b7b7b] mb-1">
                                {t("metadata.background.filename")}
                            </label>
                            <Input
                                value={tempBgData.filename}
                                onChange={(e) =>
                                    setTempBgData({ ...tempBgData, filename: e.target.value })
                                }
                                placeholder={t("metadata.background.filenamePlaceholder")}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-[#7b7b7b] mb-1">
                                    {t("metadata.background.xOffset")}
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
                                    placeholder={t("metadata.background.offsetPlaceholder")}
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-[#7b7b7b] mb-1">
                                    {t("metadata.background.yOffset")}
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
                                    placeholder={t("metadata.background.offsetPlaceholder")}
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
                                {t("metadata.background.saveChanges")}
                            </Button>
                            <Button
                                variant="secondary"
                                size="md"
                                onClick={applyBgToAll}
                                className="w-full"
                            >
                                {t("metadata.background.applyAll")}
                            </Button>
                            <Button
                                variant="ghost"
                                size="md"
                                onClick={closeBgModal}
                                className="w-full"
                            >
                                {t("metadata.background.cancel")}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
