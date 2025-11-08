import { useState, useEffect, useRef } from "react";
import { MdRefresh, MdFolder, MdSearch } from "react-icons/md";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Button } from "./common/Button";

interface Beatmapset {
    folder_name: string;
    title: string;
    artist: string;
    creator: string;
    background_path: string | null;
    beatmapID: string;
    beatmapSetID: string;
}

type MapSelectorProps = {
    onSelect?: (beatmap: Beatmapset) => void;
    selectedBeatmap?: Beatmapset | null;
    className?: string;
};

const STEP_SIZE = 16;

function BeatmapCard({
    data,
    onClick,
    isSelected
}: {
    data: Beatmapset;
    onClick: (data: Beatmapset) => void;
    isSelected?: boolean;
}) {
    const bg = data.background_path
        ? `url("${convertFileSrc(data.background_path)}")`
        : "linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%)";

    return (
        <div
            onClick={() => onClick(data)}
            className={`group relative rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${isSelected ? "ring-2 ring-white/30" : ""
                }`}
            style={{
                minHeight: "90px",
            }}
        >
            <div
                className="absolute inset-0 brightness-[0.4]"
                style={{
                    backgroundImage: bg,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    filter: "blur(2px)",
                }}
            />

            <div className="absolute inset-0 bg-black/50 group-hover:bg-black/40 transition-colors duration-200" />

            <div className="relative h-full p-3 flex flex-col justify-between min-h-[90px]">
                <div className="text-white font-normal text-sm leading-snug line-clamp-2">
                    {data.title || data.folder_name}
                </div>

                <div className="text-[#c0c0c0] text-xs font-light">
                    Mapped by {data.creator}
                </div>
            </div>
        </div>
    );
}

export function MapSelector({ onSelect, selectedBeatmap, className = "" }: MapSelectorProps) {
    const [beatmaps, setBeatmaps] = useState<Beatmapset[]>([]);
    const [search, setSearch] = useState("");
    const [isScanning, setIsScanning] = useState(false);
    const [songsFolder, setSongsFolder] = useState<string | null>(
        localStorage.getItem("songsFolder")
    );
    const [detectStatus, setDetectStatus] = useState<string>("");
    const [currentIndex, setCurrentIndex] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    const searchTimerRef = useRef<number | null>(null);

    const autoDetectOsuFolder = async (): Promise<string | null> => {
        setDetectStatus("Detecting osu! installation...");

        try {
            const path = await invoke<string>("detect_osu_path");
            setDetectStatus(`Found: ${path}`);
            setSongsFolder(path);
            localStorage.setItem("songsFolder", path);
            return path;
        } catch (err) {
            console.error("[detect] Auto-detection failed:", err);
            setDetectStatus("Auto-detection failed. Please select folder manually.");
            return null;
        }
    };

    const selectFolder = async () => {
        const selected = await open({
            directory: true,
            multiple: false,
            title: "Select osu! Songs folder",
            defaultPath: songsFolder || undefined,
        });

        if (selected && typeof selected === "string") {
            setSongsFolder(selected);
            localStorage.setItem("songsFolder", selected);
            setDetectStatus(`Selected: ${selected}`);
            return selected;
        }
        return null;
    };

    const loadStep = async (
        folder: string,
        searchQuery: string = "",
        startIndex: number = 0,
        append: boolean = false
    ) => {
        setIsScanning(true);

        try {
            const result = await invoke<[Beatmapset[], number, boolean]>("scan_songs_step", {
                basePath: folder,
                startIndex,
                stepSize: STEP_SIZE,
                searchQuery,
            });

            const [newBeatmaps, nextIndex, more] = result;

            if (append) {
                setBeatmaps((prev) => [...prev, ...newBeatmaps]);
            } else {
                setBeatmaps(newBeatmaps);
            }

            setCurrentIndex(nextIndex);
            setHasMore(more);
        } catch (err) {
            console.error("[loadStep] Error:", err);
            setDetectStatus(`Error: ${err}`);
        } finally {
            setIsScanning(false);
        }
    };

    const reloadSearch = async (searchQuery: string = "") => {
        if (!songsFolder) return;

        setBeatmaps([]);
        setCurrentIndex(0);
        setHasMore(true);
        await loadStep(songsFolder, searchQuery, 0, false);
    };

    const handleSearchChange = (value: string) => {
        setSearch(value);

        if (searchTimerRef.current) {
            clearTimeout(searchTimerRef.current);
        }

        searchTimerRef.current = setTimeout(() => {
            reloadSearch(value);
        }, 300) as unknown as number;
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (!songsFolder || isScanning || !hasMore) return;

        const element = e.currentTarget;
        const bottom =
            Math.abs(element.scrollHeight - element.scrollTop - element.clientHeight) < 10;

        if (bottom) {
            loadStep(songsFolder, search, currentIndex, true);
        }
    };

    useEffect(() => {
        (async () => {
            let folder = songsFolder;

            if (!folder) {
                folder = await autoDetectOsuFolder();
                if (!folder) {
                    folder = await selectFolder();
                    if (!folder) return;
                }
            }

            await reloadSearch();
        })();
    }, []);

    return (
        <aside
            className={`h-full w-64 shrink-0 bg-[#191919] text-[#eeeeee] border-r border-[#2a2a2a] flex flex-col ${className}`}
        >
            <div className="px-3 py-3 border-b border-[#2a2a2a]">
                <div className="space-y-2">
                    <div className="flex gap-2">
                        <Button variant="secondary" size="sm" className="flex-1" onClick={() => reloadSearch(search)} disabled={isScanning} title="Reload beatmaps" icon={<MdRefresh className={`text-base ${isScanning ? "animate-spin" : ""}`} />}>
                            Reload
                        </Button>
                        <Button
                            onClick={selectFolder}
                            disabled={isScanning}
                            variant="secondary"
                            size="sm"
                            title="Change folder"
                        >
                            <MdFolder className="text-base" />
                        </Button>
                    </div>

                    <div className="relative">
                        <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7b7b7b] text-base" />
                        <input
                            type="text"
                            placeholder="Search beatmaps..."
                            value={search}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            className="w-full h-8 pl-9 pr-3 rounded-lg bg-[#2a2a2a] border border-[#3a3a3a] text-sm placeholder-[#7b7b7b] focus:outline-none focus:border-[#4a4a4a] transition-colors"
                        />
                    </div>

                    {detectStatus && (
                        <div className="text-xs text-[#7b7b7b] truncate" title={detectStatus}>
                            {detectStatus}
                        </div>
                    )}

                    <div className="text-xs text-[#7b7b7b]">
                        {beatmaps.length} beatmap{beatmaps.length !== 1 ? "s" : ""} {hasMore && "· scroll for more"}
                    </div>
                </div>
            </div>

            <div
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-2 py-2 space-y-2 scrollbar-custom"
            >
                {beatmaps.map((b) => (
                    <BeatmapCard
                        key={b.folder_name}
                        data={b}
                        onClick={onSelect!}
                        isSelected={selectedBeatmap?.folder_name === b.folder_name}
                    />
                ))}
                {isScanning && (
                    <div className="text-center py-4 text-sm text-yellow-400 animate-pulse">
                        Loading...
                    </div>
                )}
                {!isScanning && beatmaps.length === 0 && (
                    <div className="text-center py-8 text-[#7b7b7b]">
                        <p className="text-sm">No beatmaps found</p>
                        {search && <p className="text-xs mt-2">Try a different search term</p>}
                    </div>
                )}
            </div>

            <style>{`
                .scrollbar-custom::-webkit-scrollbar {
                    width: 8px;
                }
                .scrollbar-custom::-webkit-scrollbar-track {
                    background: #1a1a1a;
                    border-radius: 4px;
                }
                .scrollbar-custom::-webkit-scrollbar-thumb {
                    background: #3a3a3a;
                    border-radius: 4px;
                    transition: background 0.2s;
                }
                .scrollbar-custom::-webkit-scrollbar-thumb:hover {
                    background: #4a4a4a;
                }
                .scrollbar-custom::-webkit-scrollbar-thumb:active {
                    background: #5a5a5a;
                }
                .scrollbar-custom {
                    scrollbar-width: thin;
                    scrollbar-color: #3a3a3a #1a1a1a;
                }
            `}</style>
        </aside>
    );
}