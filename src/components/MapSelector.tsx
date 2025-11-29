import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { MdRefresh, MdFolder, MdSearch, MdFolderOpen } from "react-icons/md";
import { createPortal } from "react-dom";

import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";

import { Button } from "./common/Button";
import { Beatmapset } from "../types/beatmap";

type MapSelectorProps = {
    onSelect?: (beatmap: Beatmapset) => void;
    selectedBeatmap?: Beatmapset | null;
    className?: string;
};

interface ContextMenuState {
    visible: boolean;
    x: number;
    y: number;
    beatmap: Beatmapset | null;
}

const STEP_SIZE = 20;
const SCROLL_THRESHOLD = 100;

const ContextMenu = memo(function ContextMenu({
    x,
    y,
    onOpenFolder,
    onClose,
}: {
    x: number;
    y: number;
    onOpenFolder: () => void;
    onClose: () => void;
}) {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [onClose]);

    return createPortal(
        <div
            ref={menuRef}
            className="fixed z-[9999] min-w-[160px] py-1 bg-[#2a2a2a] border border-[#3a3a3a] rounded-lg shadow-xl"
            style={{ left: x, top: y }}
        >
            <button
                onClick={onOpenFolder}
                className="w-full px-3 py-2 flex items-center gap-2 text-sm text-[#eeeeee] hover:bg-[#3a3a3a] transition-colors text-left"
            >
                <MdFolderOpen className="text-base" />
                Open Folder
            </button>
        </div>,
        document.body
    );
});

const BeatmapCard = memo(function BeatmapCard({
    data,
    onClick,
    onContextMenu,
    isSelected,
}: {
    data: Beatmapset;
    onClick: (data: Beatmapset) => void;
    onContextMenu: (e: React.MouseEvent, data: Beatmapset) => void;
    isSelected?: boolean;
}) {
    const bgStyle = useMemo(() => {
        if (data.background_path) {
            return {
                backgroundImage: `url("${convertFileSrc(data.background_path)}")`,
                backgroundSize: "cover",
                backgroundPosition: "center",
            };
        }
        return {
            background: "linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%)",
        };
    }, [data.background_path]);

    const handleClick = useCallback(() => {
        onClick(data);
    }, [onClick, data]);

    const handleContextMenu = useCallback(
        (e: React.MouseEvent) => {
            onContextMenu(e, data);
        },
        [onContextMenu, data]
    );

    return (
        <div
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            className={`group relative rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${isSelected ? "ring-2 ring-white/30" : ""
                }`}
            style={{ minHeight: "90px" }}
        >
            <div
                className="absolute inset-0 brightness-[0.4] blur-[2px]"
                style={bgStyle}
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
});

export function MapSelector({
    onSelect,
    selectedBeatmap,
    className = "",
}: MapSelectorProps) {
    const [beatmaps, setBeatmaps] = useState<Beatmapset[]>([]);
    const [search, setSearch] = useState("");
    const [isScanning, setIsScanning] = useState(false);
    const [songsFolder, setSongsFolder] = useState<string | null>(() =>
        localStorage.getItem("songsFolder")
    );
    const [detectStatus, setDetectStatus] = useState<string>("");
    const [currentIndex, setCurrentIndex] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [contextMenu, setContextMenu] = useState<ContextMenuState>({
        visible: false,
        x: 0,
        y: 0,
        beatmap: null,
    });

    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const currentRequestRef = useRef<number>(0);
    const isLoadingRef = useRef(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const isInitialMount = useRef(true);

    useEffect(() => {
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
        };

        document.addEventListener("contextmenu", handleContextMenu);
        return () => {
            document.removeEventListener("contextmenu", handleContextMenu);
        };
    }, []);

    const autoDetectOsuFolder = useCallback(async (): Promise<string | null> => {
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
    }, []);

    const selectFolder = useCallback(async () => {
        const selected = await open({
            directory: true,
            multiple: false,
            title: "Select osu! Songs folder",
            defaultPath: songsFolder || undefined,
        });

        if (selected && typeof selected === "string") {
            await invoke("invalidate_cache_for_path", { basePath: selected });

            setSongsFolder(selected);
            localStorage.setItem("songsFolder", selected);
            setDetectStatus(`Selected: ${selected}`);
            return selected;
        }
        return null;
    }, [songsFolder]);

    const loadStep = useCallback(
        async (
            folder: string,
            searchQuery: string = "",
            startIndex: number = 0,
            append: boolean = false,
            requestId: number
        ) => {
            if (isLoadingRef.current) return;
            isLoadingRef.current = true;
            setIsScanning(true);

            try {
                const result = await invoke<[Beatmapset[], number, boolean]>(
                    "scan_songs_step",
                    {
                        basePath: folder,
                        startIndex,
                        stepSize: STEP_SIZE,
                        searchQuery,
                    }
                );

                if (requestId !== currentRequestRef.current) {
                    return;
                }

                const [newBeatmaps, nextIndex, more] = result;

                setBeatmaps((prev) =>
                    append ? [...prev, ...newBeatmaps] : newBeatmaps
                );
                setCurrentIndex(nextIndex);
                setHasMore(more);
            } catch (err) {
                if (requestId === currentRequestRef.current) {
                    console.error("[loadStep] Error:", err);
                    setDetectStatus(`Error: ${err}`);
                }
            } finally {
                if (requestId === currentRequestRef.current) {
                    setIsScanning(false);
                }
                isLoadingRef.current = false;
            }
        },
        []
    );

    const reloadSearch = useCallback(
        async (searchQuery: string = "") => {
            if (!songsFolder) return;

            currentRequestRef.current += 1;
            const requestId = currentRequestRef.current;

            setBeatmaps([]);
            setCurrentIndex(0);
            setHasMore(true);
            await loadStep(songsFolder, searchQuery, 0, false, requestId);
        },
        [songsFolder, loadStep]
    );

    const forceReload = useCallback(async () => {
        if (!songsFolder) return;

        setIsScanning(true);
        setDetectStatus("Reloading...");

        try {
            const count = await invoke<number>("reload_beatmaps", {
                basePath: songsFolder,
            });
            setDetectStatus(`Reloaded ${count} beatmaps`);
            await reloadSearch(search);
        } catch (err) {
            console.error("[forceReload] Error:", err);
            setDetectStatus(`Reload error: ${err}`);
            setIsScanning(false);
        }
    }, [songsFolder, search, reloadSearch]);

    const handleSearchChange = useCallback(
        (value: string) => {
            setSearch(value);

            if (searchTimerRef.current) {
                clearTimeout(searchTimerRef.current);
            }

            searchTimerRef.current = setTimeout(() => {
                reloadSearch(value);
            }, 300);
        },
        [reloadSearch]
    );

    const handleScroll = useCallback(
        (e: React.UIEvent<HTMLDivElement>) => {
            if (!songsFolder || isLoadingRef.current || !hasMore) return;

            const element = e.currentTarget;
            const distanceFromBottom =
                element.scrollHeight - element.scrollTop - element.clientHeight;

            if (distanceFromBottom < SCROLL_THRESHOLD) {
                currentRequestRef.current += 1;
                const requestId = currentRequestRef.current;
                loadStep(songsFolder, search, currentIndex, true, requestId);
            }
        },
        [songsFolder, hasMore, search, currentIndex, loadStep]
    );

    const handleCardContextMenu = useCallback(
        (e: React.MouseEvent, beatmap: Beatmapset) => {
            e.preventDefault();
            e.stopPropagation();

            setContextMenu({
                visible: true,
                x: e.clientX,
                y: e.clientY,
                beatmap,
            });
        },
        []
    );

    const closeContextMenu = useCallback(() => {
        setContextMenu((prev) => ({ ...prev, visible: false, beatmap: null }));
    }, []);

    const handleOpenFolder = useCallback(async () => {
        if (!contextMenu.beatmap || !songsFolder) return;

        const folderPath = `${songsFolder}\\${contextMenu.beatmap.folder_name}`;

        try {
            await openPath(folderPath);
        } catch (err) {
            console.error("[openFolder] Error:", err);
        }

        closeContextMenu();
    }, [contextMenu.beatmap, songsFolder, closeContextMenu]);

    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }

        if (songsFolder) {
            reloadSearch(search);
        }
    }, [songsFolder]);

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

        return () => {
            if (searchTimerRef.current) {
                clearTimeout(searchTimerRef.current);
            }
        };
    }, []);

    const handleCardClick = useCallback(
        (beatmap: Beatmapset) => {
            onSelect?.(beatmap);
        },
        [onSelect]
    );

    const statusText = useMemo(() => {
        const count = beatmaps.length;
        const suffix = count !== 1 ? "s" : "";
        const moreText = hasMore ? " · scroll for more" : "";
        return `${count} beatmap${suffix}${moreText}`;
    }, [beatmaps.length, hasMore]);

    return (
        <aside
            className={`h-full w-64 shrink-0 bg-[#191919] text-[#eeeeee] border-r border-[#2a2a2a] flex flex-col ${className}`}
        >
            <div className="px-3 py-3 border-b border-[#2a2a2a]">
                <div className="space-y-2">
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            className="flex-1"
                            onClick={forceReload}
                            disabled={isScanning}
                            title="Reload beatmaps"
                            icon={
                                <MdRefresh
                                    className={`text-base ${isScanning ? "animate-spin" : ""}`}
                                />
                            }
                        >
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
                        <div
                            className="text-xs text-[#7b7b7b] truncate"
                            title={detectStatus}
                        >
                            {detectStatus}
                        </div>
                    )}

                    <div className="text-xs text-[#7b7b7b]">{statusText}</div>
                </div>
            </div>

            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-2 py-2 space-y-2 scrollbar-custom"
            >
                {beatmaps.map((b) => (
                    <BeatmapCard
                        key={b.folder_name}
                        data={b}
                        onClick={handleCardClick}
                        onContextMenu={handleCardContextMenu}
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
                        {search && (
                            <p className="text-xs mt-2">Try a different search term</p>
                        )}
                    </div>
                )}
            </div>

            {contextMenu.visible && contextMenu.beatmap && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onOpenFolder={handleOpenFolder}
                    onClose={closeContextMenu}
                />
            )}

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