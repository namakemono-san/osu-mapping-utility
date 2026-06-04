import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { MdRefresh, MdSearch, MdClose, MdFolderOpen, MdOpenInBrowser, MdComment, MdDownload } from "react-icons/md";
import { createPortal } from "react-dom";

import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";

import { Button } from "../Button";
import { StatusMessage } from "../StatusMessage";

import { Beatmapset } from "../../types/beatmap";
import { useSongsFolder } from "../../hooks/useStorage";
import { useI18n } from "../../hooks/i18nContext";

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
    onOpenWebPage,
    onOpenDiscussion,
    onOpenDirect,
    onClose,
}: {
    x: number;
    y: number;
    onOpenFolder: () => void;
    onOpenWebPage: () => void;
    onOpenDiscussion: () => void;
    onOpenDirect: () => void;
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

    const items = [
        { onClick: onOpenFolder, Icon: MdFolderOpen, label: t("mapSelector.context.openFolder") },
        { onClick: onOpenWebPage, Icon: MdOpenInBrowser, label: t("mapSelector.context.openWebPage") },
        { onClick: onOpenDiscussion, Icon: MdComment, label: t("mapSelector.context.openDiscussion") },
        { onClick: onOpenDirect, Icon: MdDownload, label: t("mapSelector.context.openDirect") },
    ];

    return createPortal(
        <div
            ref={menuRef}
            className="fixed z-9999 min-w-160 py-1 bg-surface-hover border border-border-strong rounded-lg shadow-xl"
            style={{ left: x, top: y }}
        >
            {items.map(({ onClick, Icon, label }) => (
                <button
                    key={label}
                    onClick={onClick}
                    className="w-full px-3 py-2 flex items-center gap-2 text-sm text-text-primary hover:bg-surface-hover-strong transition-colors text-left"
                >
                    <Icon className="text-base shrink-0" />
                    {label}
                </button>
            ))}
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
    const [loadError, setLoadError] = useState<string | null>(null);
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
        setLoadError(null);

        try {
            const path = await invoke<string>("detect_osu_path");
            setLoadError(null);
            setSongsFolder(path);
            return path;
        } catch (err) {
            console.error("[detect] Auto-detection failed:", err);
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
            await invoke("reload_beatmapsets", { basePath: selected });

            setSongsFolder(selected);
            setLoadError(null);
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
            setLoadError(null);

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
                setLoadError(null);
            } catch (err) {
                if (requestId === currentRequestRef.current) {
                    console.error("[loadStep] Error:", err);
                    setLoadError(String(err));
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

            setLoadError(null);

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
        setLoadError(null);

        try {
            await invoke<number>("reload_beatmapsets", {
                basePath: songsFolder,
            });
            await reloadSearch(debouncedSearch);
        } catch (err) {
            console.error("[forceReload] Error:", err);
            setLoadError(String(err));
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

    const handleOpenWebPage = useCallback(async () => {
        if (!contextMenu.beatmap) return;
        await openUrl(`https://osu.ppy.sh/beatmapsets/${contextMenu.beatmap.beatmapSetID}`);
        closeContextMenu();
    }, [contextMenu.beatmap, closeContextMenu]);

    const handleOpenDiscussion = useCallback(async () => {
        if (!contextMenu.beatmap) return;
        const { beatmapSetID, beatmapID } = contextMenu.beatmap;
        await openUrl(`https://osu.ppy.sh/beatmapsets/${beatmapSetID}/discussion/${beatmapID}`);
        closeContextMenu();
    }, [contextMenu.beatmap, closeContextMenu]);

    const handleOpenDirect = useCallback(async () => {
        if (!contextMenu.beatmap) return;
        await openUrl(`osu://dl/${contextMenu.beatmap.beatmapSetID}`);
        closeContextMenu();
    }, [contextMenu.beatmap, closeContextMenu]);

    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }
        if (!songsFolder) return;
        void reloadSearch(debouncedSearch);
    }, [songsFolder, debouncedSearch, reloadSearch]);

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

    return (
        <aside
            className={`h-full w-64 shrink-0 bg-surface-sidebar text-text-primary border-r border-border-muted flex flex-col ${className}`}
        >
            <div className="px-1 py-2 border-b border-border-muted">
                <div className="space-y-2">
                    {/* <div className="flex gap-2">
                        <Button
                            onClick={selectFolder}
                            disabled={isScanning}
                            variant="secondary"
                            size="sm"
                            title={t("mapSelector.button.changeFolderTitle")}
                        >
                            <MdFolder className="text-base" />
                        </Button>
                    </div> */}
                    <div className="flex gap-1">
                        <div className="relative flex-1">
                            <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-base" />
                            <input
                                type="text"
                                placeholder={t("mapSelector.search.placeholder")}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className={`w-full h-8 pl-9 ${search ? "pr-8" : "pr-3"} rounded-lg bg-surface-hover border border-border-strong text-sm placeholder-text-muted focus:outline-none focus:border-border-focus transition-colors`}
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-white transition-colors"
                                    aria-label="Clear search"
                                >
                                    <MdClose className="text-base" />
                                </button>
                            )}
                        </div>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={forceReload}
                            disabled={isScanning}
                            title={t("mapSelector.button.reloadTitle")}
                        >
                            <MdRefresh
                                className={`text-base ${isScanning ? "animate-spin" : ""}`}
                            />
                        </Button>
                    </div>
                </div>
            </div>

            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-2 py-2 space-y-2 scrollbar-hide"
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
                {isScanning && beatmaps.length > 0 && (
                    <div className="text-center py-4 text-sm text-yellow-400 animate-pulse">
                        {t("mapSelector.loading")}
                    </div>
                )}
                {beatmaps.length === 0 && (
                    <div className="text-center py-8 text-text-muted">
                        {isScanning ? (
                            <p className="text-sm animate-pulse">{t("mapSelector.loading")}</p>
                        ) : loadError ? (
                            <div className="space-y-2">
                                <StatusMessage type="error" message={t("mapSelector.error.loadFailed")} />
                                <p className="text-xs opacity-70 wrap-break-word">{loadError}</p>
                            </div>
                        ) : !songsFolder ? (
                            <p className="text-sm">{t("mapSelector.empty.noSongsFolder")}</p>
                        ) : (
                            <>
                                <p className="text-sm">{t("mapSelector.empty.noBeatmaps")}</p>
                                {search ? (
                                    <p className="text-xs mt-2">{t("mapSelector.empty.tryDifferent")}</p>
                                ) : (
                                    <p className="text-xs mt-2">{t("mapSelector.empty.hintSongsFolder")}</p>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            {contextMenu.visible && contextMenu.beatmap && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onOpenFolder={handleOpenFolder}
                    onOpenWebPage={handleOpenWebPage}
                    onOpenDiscussion={handleOpenDiscussion}
                    onOpenDirect={handleOpenDirect}
                    onClose={closeContextMenu}
                />
            )}


        </aside>
    );
}
