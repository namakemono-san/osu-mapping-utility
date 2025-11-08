import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FiCheckCircle, FiAlertCircle, FiRefreshCw, FiCopy } from "react-icons/fi";

import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { Input } from "../components/common/Input";
import { Select } from "../components/common/Select";

interface BeatmapCloneProps {
    selectedBeatmap?: {
        folder_name: string;
        title: string;
        artist: string;
        creator: string;
    };
}

type GameMode = "osu" | "taiko" | "catch" | "mania";

const DIFFICULTIES: Record<GameMode, string[]> = {
    osu: ["Easy", "Normal", "Hard", "Insane", "Expert"],
    taiko: ["Kantan", "Futsuu", "Muzukashii", "Oni", "Inner Oni"],
    catch: ["Cup", "Salad", "Platter", "Rain", "Overdose"],
    mania: ["Easy", "Normal", "Hard", "Insane", "Expert"],
};

const MODE_VALUES: Record<GameMode, number> = {
    osu: 0,
    taiko: 1,
    catch: 2,
    mania: 3,
};

export function BeatmapClone({ selectedBeatmap }: BeatmapCloneProps) {
    const [processing, setProcessing] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
    const [loading, setLoading] = useState(false);

    const [gameMode, setGameMode] = useState<GameMode>("taiko");
    const [selectedDifficulties, setSelectedDifficulties] = useState<Set<string>>(new Set());

    const [title, setTitle] = useState("");
    const [titleUnicode, setTitleUnicode] = useState("");
    const [artist, setArtist] = useState("");
    const [artistUnicode, setArtistUnicode] = useState("");
    const [creator, setCreator] = useState("");
    const [source, setSource] = useState("");
    const [tags, setTags] = useState("");

    const [keepTimingPoints, setKeepTimingPoints] = useState(true);
    const [removeSkinFiles, setRemoveSkinFiles] = useState(true);
    const [resetSampleSet, setResetSampleSet] = useState(true);
    const [resetDifficulty, setResetDifficulty] = useState(true);
    const [removeColours, setRemoveColours] = useState(true);

    useEffect(() => {
        if (!selectedBeatmap) return;

        (async () => {
            setLoading(true);
            try {
                const songsFolder = localStorage.getItem("songsFolder");
                if (!songsFolder) {
                    console.error("Songs folder not found");
                    return;
                }

                const beatmapPath = `${songsFolder}\\${selectedBeatmap.folder_name}`;

                const osuFiles = await invoke<string[]>("list_osu_files", {
                    beatmapFolder: beatmapPath
                });

                if (osuFiles.length === 0) {
                    console.error("No .osu files found");
                    return;
                }

                const firstFile = `${beatmapPath}\\${osuFiles[0]}`;
                const content = await invoke<string>("read_osu_file", { filePath: firstFile });

                const lines = content.split(/\r?\n/);
                let inMetadata = false;

                for (const line of lines) {
                    const trimmed = line.trim();

                    if (/^\[Metadata\]$/i.test(trimmed)) {
                        inMetadata = true;
                        continue;
                    }

                    if (/^\[[A-Za-z]+\]$/.test(trimmed)) {
                        inMetadata = false;
                        continue;
                    }

                    if (!inMetadata || !trimmed || trimmed.startsWith("//")) continue;

                    const colonIndex = trimmed.indexOf(":");
                    if (colonIndex === -1) continue;

                    const key = trimmed.substring(0, colonIndex).trim();
                    const value = trimmed.substring(colonIndex + 1).trim();

                    switch (key) {
                        case "Title":
                            setTitle(value);
                            break;
                        case "TitleUnicode":
                            setTitleUnicode(value);
                            break;
                        case "Artist":
                            setArtist(value);
                            break;
                        case "ArtistUnicode":
                            setArtistUnicode(value);
                            break;
                        case "Creator":
                            setCreator(value);
                            break;
                        case "Source":
                            setSource(value);
                            break;
                        case "Tags":
                            setTags(value);
                            break;
                    }
                }
            } catch (err) {
                console.error("[Clone] Failed to load metadata:", err);
            } finally {
                setLoading(false);
            }
        })();
    }, [selectedBeatmap]);

    const toggleDifficulty = (diff: string) => {
        setSelectedDifficulties(prev => {
            const newSet = new Set(prev);
            if (newSet.has(diff)) {
                newSet.delete(diff);
            } else {
                newSet.add(diff);
            }
            return newSet;
        });
    };

    const toggleAllDifficulties = () => {
        const allDiffs = DIFFICULTIES[gameMode];
        if (selectedDifficulties.size === allDiffs.length) {
            setSelectedDifficulties(new Set());
        } else {
            setSelectedDifficulties(new Set(allDiffs));
        }
    };

    const onClone = useCallback(async () => {
        if (!selectedBeatmap || selectedDifficulties.size === 0) return;

        setProcessing(true);
        setResult(null);

        try {
            const songsFolder = localStorage.getItem("songsFolder");
            if (!songsFolder) {
                throw new Error("Songs folder not found");
            }

            const result = await invoke<string>("clone_beatmap", {
                sourceBeatmap: selectedBeatmap.folder_name,
                gameMode: MODE_VALUES[gameMode],
                difficulties: Array.from(selectedDifficulties),
                metadata: {
                    title: title || selectedBeatmap.title,
                    title_unicode: titleUnicode || title || selectedBeatmap.title,
                    artist: artist || selectedBeatmap.artist,
                    artist_unicode: artistUnicode || artist || selectedBeatmap.artist,
                    creator: creator || selectedBeatmap.creator,
                    source: source || "",
                    tags: tags || "",
                },
                keepTimingPoints,
                removeSkinFiles,
                resetSampleSet,
                resetDifficulty,
                removeColours,
                songsFolder,
            });

            setResult({
                success: true,
                message: result,
            });
        } catch (err) {
            console.error("Clone failed:", err);
            setResult({
                success: false,
                message: `Error: ${err}`,
            });
        } finally {
            setProcessing(false);
        }
    }, [selectedBeatmap, selectedDifficulties, gameMode, title, titleUnicode, artist, artistUnicode, creator, source, tags, keepTimingPoints, removeSkinFiles, resetSampleSet, resetDifficulty, removeColours]);

    if (!selectedBeatmap) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center text-[#7b7b7b]">
                    <div className="text-4xl mb-3 opacity-30">📝</div>
                    <p>Select a beatmap to clone</p>
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
                        <h2 className="text-lg font-bold mb-1.5">Clone: {title || selectedBeatmap.title}</h2>
                        <div className="text-xs text-[#7b7b7b]">
                            Original by {creator || selectedBeatmap.creator}
                        </div>
                    </Card>

                    <Card className="p-3">
                        <h3 className="font-semibold text-sm mb-3">Game Mode</h3>
                        <Select
                            value={gameMode}
                            onChange={(e) => {
                                setGameMode(e.target.value as GameMode);
                                setSelectedDifficulties(new Set());
                            }}
                        >
                            <option value="osu">osu!</option>
                            <option value="taiko">osu!taiko</option>
                            <option value="catch">osu!catch</option>
                            <option value="mania">osu!mania</option>
                        </Select>
                    </Card>

                    <Card className="p-3">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold text-sm">Difficulties</h3>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={toggleAllDifficulties}
                                className="h-auto px-0 text-[#2563eb] hover:text-[#1f56cc] hover:bg-transparent"
                            >
                                {selectedDifficulties.size === DIFFICULTIES[gameMode].length ? "Deselect All" : "Select All"}
                            </Button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                            {DIFFICULTIES[gameMode].map((diff) => {
                                const isSelected = selectedDifficulties.has(diff);

                                return (
                                    <button
                                        key={diff}
                                        onClick={() => toggleDifficulty(diff)}
                                        className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all duration-200 hover:scale-105 active:scale-95 ${isSelected
                                            ? "bg-[#2563eb]/20 border-[#2563eb] text-white shadow-lg shadow-[#2563eb]/20"
                                            : "bg-[#171717] border-[#2a2a2a] text-[#e0e0e0]"
                                            }`}
                                    >
                                        {diff}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="mt-2 text-xs text-[#7b7b7b]">
                            {selectedDifficulties.size} selected
                        </div>
                    </Card>

                    <Card className="p-3">
                        <h3 className="font-semibold text-sm mb-3">Metadata</h3>
                        <div className="space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-[#7b7b7b] mb-1">Title</label>
                                    <Input
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="Title"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-[#7b7b7b] mb-1">Title (Unicode)</label>
                                    <Input
                                        value={titleUnicode}
                                        onChange={(e) => setTitleUnicode(e.target.value)}
                                        placeholder="Title Unicode"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-[#7b7b7b] mb-1">Artist</label>
                                    <Input
                                        value={artist}
                                        onChange={(e) => setArtist(e.target.value)}
                                        placeholder="Artist"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-[#7b7b7b] mb-1">Artist (Unicode)</label>
                                    <Input
                                        value={artistUnicode}
                                        onChange={(e) => setArtistUnicode(e.target.value)}
                                        placeholder="Artist Unicode"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-[#7b7b7b] mb-1">Creator</label>
                                <Input
                                    value={creator}
                                    onChange={(e) => setCreator(e.target.value)}
                                    placeholder="Creator"
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-[#7b7b7b] mb-1">Source</label>
                                <Input
                                    value={source}
                                    onChange={(e) => setSource(e.target.value)}
                                    placeholder="Source (optional)"
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-[#7b7b7b] mb-1">Tags</label>
                                <textarea
                                    value={tags}
                                    onChange={(e) => setTags(e.target.value)}
                                    placeholder="Space-separated tags"
                                    rows={3}
                                    className="w-full px-3 py-2 rounded-lg bg-[#101010] border border-[#2a2a2a] text-sm text-white placeholder-[#7b7b7b] focus:outline-none focus:border-[#4a4a4a] transition-colors resize-none"
                                />
                            </div>
                        </div>
                    </Card>

                    <Card className="p-3">
                        <h3 className="font-semibold text-sm mb-3">Advanced Options</h3>
                        <div className="space-y-2">
                            <button
                                onClick={() => setKeepTimingPoints(!keepTimingPoints)}
                                className={`flex flex-col gap-1 px-3 py-2.5 rounded-lg border text-left transition-all duration-200 hover:scale-105 active:scale-95 w-full ${keepTimingPoints
                                    ? "bg-[#2563eb]/20 border-[#2563eb] shadow-lg shadow-[#2563eb]/20"
                                    : "bg-[#171717] border-[#2a2a2a]"
                                    }`}
                            >
                                <div className="font-medium text-sm">Keep Timing Points (BPM + Kiai)</div>
                                <div className="text-xs text-[#7b7b7b]">
                                    Preserve BPM changes and Kiai sections from original beatmap
                                </div>
                            </button>

                            <button
                                onClick={() => setRemoveSkinFiles(!removeSkinFiles)}
                                className={`flex flex-col gap-1 px-3 py-2.5 rounded-lg border text-left transition-all duration-200 hover:scale-105 active:scale-95 w-full ${removeSkinFiles
                                    ? "bg-[#2563eb]/20 border-[#2563eb] shadow-lg shadow-[#2563eb]/20"
                                    : "bg-[#171717] border-[#2a2a2a]"
                                    }`}
                            >
                                <div className="font-medium text-sm">Remove Skin Files</div>
                                <div className="text-xs text-[#7b7b7b]">
                                    Delete custom skin images and hitsounds
                                </div>
                            </button>

                            <button
                                onClick={() => setResetSampleSet(!resetSampleSet)}
                                className={`flex flex-col gap-1 px-3 py-2.5 rounded-lg border text-left transition-all duration-200 hover:scale-105 active:scale-95 w-full ${resetSampleSet
                                    ? "bg-[#2563eb]/20 border-[#2563eb] shadow-lg shadow-[#2563eb]/20"
                                    : "bg-[#171717] border-[#2a2a2a]"
                                    }`}
                            >
                                <div className="font-medium text-sm">Reset Sample Set to Normal</div>
                                <div className="text-xs text-[#7b7b7b]">
                                    Set General.SampleSet to Normal
                                </div>
                            </button>

                            <button
                                onClick={() => setResetDifficulty(!resetDifficulty)}
                                className={`flex flex-col gap-1 px-3 py-2.5 rounded-lg border text-left transition-all duration-200 hover:scale-105 active:scale-95 w-full ${resetDifficulty
                                    ? "bg-[#2563eb]/20 border-[#2563eb] shadow-lg shadow-[#2563eb]/20"
                                    : "bg-[#171717] border-[#2a2a2a]"
                                    }`}
                            >
                                <div className="font-medium text-sm">Reset Difficulty Settings</div>
                                <div className="text-xs text-[#7b7b7b]">
                                    HP:5, CS:2, OD:5, AR:5, SliderMultiplier:1.4, SliderTickRate:1
                                </div>
                            </button>

                            <button
                                onClick={() => setRemoveColours(!removeColours)}
                                className={`flex flex-col gap-1 px-3 py-2.5 rounded-lg border text-left transition-all duration-200 hover:scale-105 active:scale-95 w-full ${removeColours
                                    ? "bg-[#2563eb]/20 border-[#2563eb] shadow-lg shadow-[#2563eb]/20"
                                    : "bg-[#171717] border-[#2a2a2a]"
                                    }`}
                            >
                                <div className="font-medium text-sm">Remove Colours Section</div>
                                <div className="text-xs text-[#7b7b7b]">
                                    Delete custom combo colours (not needed for non-osu! modes)
                                </div>
                            </button>
                        </div>
                    </Card>

                    <Card className="p-3">
                        <h3 className="font-semibold text-sm mb-2">Preview</h3>
                        <div className="text-xs text-[#7b7b7b] space-y-1">
                            <div>
                                New folder: <span className="text-[#e0e0e0]">
                                    beatmap-###-{(artist || selectedBeatmap.artist).replace(/ /g, '_')}_{(title || selectedBeatmap.title).replace(/ /g, '_')}
                                </span>
                            </div>
                            <div>Creator: <span className="text-[#e0e0e0]">{creator || selectedBeatmap.creator}</span></div>
                            <div>Mode: <span className="text-[#e0e0e0]">{gameMode}</span></div>
                            <div>Difficulties: <span className="text-[#e0e0e0]">{selectedDifficulties.size}</span></div>
                        </div>
                    </Card>

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
                <div className="max-w-5xl mx-auto">
                    <Button
                        variant="primary"
                        size="lg"
                        icon={processing ? <FiRefreshCw className="animate-spin" /> : <FiCopy />}
                        onClick={onClone}
                        disabled={processing || selectedDifficulties.size === 0}
                        className="w-full"
                    >
                        {processing
                            ? "Creating..."
                            : `Create ${selectedDifficulties.size} Beatmap${selectedDifficulties.size !== 1 ? 's' : ''}`
                        }
                    </Button>
                </div>
            </div>
        </div>
    );
}