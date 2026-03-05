import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { MdRefresh, MdFolder, MdSearch, MdFolderOpen } from "react-icons/md";
import { createPortal } from "react-dom";

import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";

import { Button } from "./common/Button";

import { Beatmapset } from "../types/beatmap";
import { useSongsFolder } from "../hooks/useStorage";
import { useI18n } from "../hooks/i18nContext";
import type { LocaleKey } from "../locale";

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

const STEP_SIZE = 30;
const SCROLL_THRESHOLD = 200;
const SEARCH_DEBOUNCE_MS = 400;

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
    const { t } = useI18n();
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
            className="fixed z-9999 min-w-160 py-1 bg-surface-hover border border-border-strong rounded-lg shadow-xl"
            style={{ left: x, top: y }}
        >
            <button
                onClick={onOpenFolder}
                className="w-full px-3 py-2 flex items-center gap-2 text-sm text-text-primary hover:bg-surface-hover-strong transition-colors text-left"
            >
                <MdFolderOpen className="text-base" />
                {t("mapSelector.context.openFolder")}
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
    const { t } = useI18n();
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
            className={`group relative rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover-scale-soft active-scale-soft ${isSelected ? "ring-2 ring-white/30" : ""
                }`}
            style={{ minHeight: "90px" }}
        >
            <div className="preview-overlay-filter absolute inset-0" style={bgStyle} />
            <div className="absolute inset-0 bg-black/50 group-hover:bg-black/40 transition-colors duration-200" />
            <div className="relative h-full p-3 flex flex-col justify-between min-h-90">
                <div className="text-white font-normal text-sm leading-snug line-clamp-2">
                    {data.title || data.folder_name}
                </div>
                <div className="text-text-subtle text-xs font-light">
                    {t("mapSelector.mappedBy", { creator: data.creator })}
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
    const { t } = useI18n();

    const [beatmaps, setBeatmaps] = useState<Beatmapset[]>([]);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [isScanning, setIsScanning] = useState(false);
    const [songsFolder, setSongsFolder] = useSongsFolder();
    const [detectStatus, setDetectStatus] = useState<
        | { key: LocaleKey; params?: Record<string, string | number> }
        | null
    >(null);
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
    const pendingReloadRef = useRef<{ folder: string; searchQuery: string } | null>(null);
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
        setDetectStatus({ key: "mapSelector.detect.detecting" });

        try {
            const path = await invoke<string>("detect_osu_path");
            setDetectStatus({ key: "mapSelector.detect.found", params: { path } });
            setSongsFolder(path);
            return path;
        } catch (err) {
            console.error("[detect] Auto-detection failed:", err);
            setDetectStatus({ key: "mapSelector.detect.failed" });
            return null;
        }
    }, [setSongsFolder]);

    const selectFolder = useCallback(async () => {
        const selected = await open({
            directory: true,
            multiple: false,
            title: t("mapSelector.dialog.selectSongsFolder"),
            defaultPath: songsFolder || undefined,
        });

        if (selected && typeof selected === "string") {
            await invoke("invalidate_songs_cache", { basePath: selected });

            setSongsFolder(selected);
            setDetectStatus({ key: "mapSelector.detect.selected", params: { path: selected } });
            setSearch("");
            setDebouncedSearch("");
            setBeatmaps([]);
            setCurrentIndex(0);
            setHasMore(true);
            if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTop = 0;
            }
            return selected;
        }
        return null;
    }, [songsFolder, setSongsFolder, t]);

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
                const useFullSearch = searchQuery.length > 0 && !searchQuery.match(/^\d+\s/);

                let result: [Beatmapset[], number, boolean];

                if (useFullSearch && searchQuery.length >= 2) {
                    result = await invoke<[Beatmapset[], number, boolean]>(
                        "search_beatmapsets",
                        {
                            basePath: folder,
                            searchQuery,
                            startIndex,
                            stepSize: STEP_SIZE,
                        }
                    );
                } else {
                    result = await invoke<[Beatmapset[], number, boolean]>(
                        "scan_beatmapsets",
                        {
                            basePath: folder,
                            startIndex,
                            stepSize: STEP_SIZE,
                            searchQuery,
                        }
                    );
                }

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
                    setDetectStatus({ key: "mapSelector.detect.error", params: { error: String(err) } });
                }
            } finally {
                isLoadingRef.current = false;

                const pending = pendingReloadRef.current;
                if (pending) {
                    pendingReloadRef.current = null;
                    const nextRequestId = currentRequestRef.current;

                    setBeatmaps([]);
                    setCurrentIndex(0);
                    setHasMore(true);
                    if (scrollContainerRef.current) {
                        scrollContainerRef.current.scrollTop = 0;
                    }

                    void loadStep(pending.folder, pending.searchQuery, 0, false, nextRequestId);
                    return;
                }

                setIsScanning(false);
            }
        },
        []
    );

    const reloadSearch = useCallback(
        async (searchQuery: string = "") => {
            if (!songsFolder) return;

            if (isLoadingRef.current) {
                currentRequestRef.current += 1;
                pendingReloadRef.current = { folder: songsFolder, searchQuery };
                setIsScanning(true);
                return;
            }

            currentRequestRef.current += 1;
            const requestId = currentRequestRef.current;

            setBeatmaps([]);
            setCurrentIndex(0);
            setHasMore(true);

            if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTop = 0;
            }

            await loadStep(songsFolder, searchQuery, 0, false, requestId);
        },
        [songsFolder, loadStep]
    );

    const forceReload = useCallback(async () => {
        if (!songsFolder) return;

        setIsScanning(true);
        setDetectStatus({ key: "mapSelector.detect.reloading" });

        try {
            const count = await invoke<number>("reload_songs", {
                basePath: songsFolder,
            });
            setDetectStatus({ key: "mapSelector.detect.foundBeatmaps", params: { count } });
            await reloadSearch(debouncedSearch);
        } catch (err) {
            console.error("[forceReload] Error:", err);
            setDetectStatus({ key: "mapSelector.detect.reloadError", params: { error: String(err) } });
            setIsScanning(false);
        }
    }, [songsFolder, debouncedSearch, reloadSearch]);

    useEffect(() => {
        if (searchTimerRef.current) {
            clearTimeout(searchTimerRef.current);
        }

        searchTimerRef.current = setTimeout(() => {
            setDebouncedSearch(search);
        }, SEARCH_DEBOUNCE_MS);

        return () => {
            if (searchTimerRef.current) {
                clearTimeout(searchTimerRef.current);
            }
        };
    }, [search]);

    useEffect(() => {
        if (isInitialMount.current) return;
        reloadSearch(debouncedSearch);
    }, [debouncedSearch, reloadSearch]);

    const handleScroll = useCallback(
        (e: React.UIEvent<HTMLDivElement>) => {
            if (!songsFolder || isLoadingRef.current || !hasMore) return;

            const element = e.currentTarget;
            const distanceFromBottom =
                element.scrollHeight - element.scrollTop - element.clientHeight;

            if (distanceFromBottom < SCROLL_THRESHOLD) {
                currentRequestRef.current += 1;
                const requestId = currentRequestRef.current;
                loadStep(songsFolder, debouncedSearch, currentIndex, true, requestId);
            }
        },
        [songsFolder, hasMore, debouncedSearch, currentIndex, loadStep]
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

        if (!songsFolder) return;

        currentRequestRef.current += 1;
        const requestId = currentRequestRef.current;
        setBeatmaps([]);
        setCurrentIndex(0);
        setHasMore(true);
        if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
        void loadStep(songsFolder, debouncedSearch, 0, false, requestId);
    }, [songsFolder, debouncedSearch, loadStep]);

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

            currentRequestRef.current += 1;
            const requestId = currentRequestRef.current;
            setBeatmaps([]);
            setCurrentIndex(0);
            setHasMore(true);
            await loadStep(folder, "", 0, false, requestId);
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
        const loaded = beatmaps.length;
        const moreText = hasMore ? ` · ${t("mapSelector.status.scrollForMore")}` : "";

        if (debouncedSearch) {
            return t("mapSelector.status.results", { count: loaded, more: moreText });
        }

        return t("mapSelector.status.loaded", { count: loaded, more: moreText });
    }, [beatmaps.length, hasMore, debouncedSearch, t]);

    return (
        <aside
            className={`h-full w-64 shrink-0 bg-surface-sidebar text-text-primary border-r border-border-muted flex flex-col ${className}`}
        >
            <div className="px-3 py-3 border-b border-border-muted">
                <div className="space-y-2">
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            className="flex-1"
                            onClick={forceReload}
                            disabled={isScanning}
                            title={t("mapSelector.button.reloadTitle")}
                            icon={
                                <MdRefresh
                                    className={`text-base ${isScanning ? "animate-spin" : ""}`}
                                />
                            }
                        >
                            {t("mapSelector.button.reload")}
                        </Button>
                        <Button
                            onClick={selectFolder}
                            disabled={isScanning}
                            variant="secondary"
                            size="sm"
                            title={t("mapSelector.button.changeFolderTitle")}
                        >
                            <MdFolder className="text-base" />
                        </Button>
                    </div>

                    <div className="relative">
                        <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-base" />
                        <input
                            type="text"
                            placeholder={t("mapSelector.search.placeholder")}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full h-8 pl-9 pr-3 rounded-lg bg-surface-hover border border-border-strong text-sm placeholder-text-muted focus:outline-none focus:border-border-focus transition-colors"
                        />
                    </div>

                    {detectStatus && (
                        <div
                            className="text-xs text-text-muted truncate"
                            title={t(detectStatus.key, detectStatus.params)}
                        >
                            {t(detectStatus.key, detectStatus.params)}
                        </div>
                    )}

                    <div className="text-xs text-text-muted">{statusText}</div>
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
                        {t("mapSelector.loading")}
                    </div>
                )}
                {!isScanning && beatmaps.length === 0 && (
                    <div className="text-center py-8 text-text-muted">
                        <p className="text-sm">{t("mapSelector.empty.noBeatmaps")}</p>
                        {search && (
                            <p className="text-xs mt-2">{t("mapSelector.empty.tryDifferent")}</p>
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
