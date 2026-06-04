import { useState } from "react";
import {
    MdContentCut,
    MdDownload,
    MdSpeed,
    MdChevronRight,
    MdChevronLeft,
    MdContentCopy,
    MdRemoveRedEye,
    MdEdit,
    MdFolderOpen,
    MdImage,
    MdGraphicEq,
    MdCheckCircle,
    MdBarChart,
} from "react-icons/md";
import { appDataDir } from "@tauri-apps/api/path";
import { openPath } from '@tauri-apps/plugin-opener';

import { useI18n } from "../../hooks/i18nContext";
import type { LocaleKey } from "../../locale";

export type SidebarKey =
    | "beatmap_clone"
    | "beatmap_preview"
    | "beatmap_customizer"
    | "offset_calibrator"
    | "audio_analyzer"
    | "metadata_editor"
    | "video_downloader"
    | "image_downloader"
    | "metadata_checker"
    | "spread_analyzer"

type SidebarProps = {
    active?: SidebarKey;
    onChange?: (key: SidebarKey) => void;
    className?: string;
    defaultExpanded?: boolean;
};

type SidebarItem = {
    key: SidebarKey;
    label: LocaleKey;
    Icon: React.ComponentType<{ className?: string }>;
};

type SidebarCategory = {
    title: LocaleKey;
    items: SidebarItem[];
};

const CATEGORIES: SidebarCategory[] = [
    {
        title: "sidebar.category.mapTools",
        items: [
            { key: "beatmap_clone", label: "tool.beatmap_clone", Icon: MdContentCopy },
            { key: "beatmap_preview", label: "tool.beatmap_preview", Icon: MdRemoveRedEye },
            { key: "beatmap_customizer", label: "tool.beatmap_customizer", Icon: MdContentCut },
            { key: "metadata_editor", label: "tool.metadata_editor", Icon: MdEdit },
            { key: "metadata_checker", label: "tool.metadata_checker", Icon: MdCheckCircle },
            { key: "spread_analyzer", label: "tool.spread_analyzer", Icon: MdBarChart },
        ],
    },
    {
        title: "sidebar.category.utilities",
        items: [
            { key: "offset_calibrator", label: "tool.offset_calibrator", Icon: MdSpeed },
            { key: "audio_analyzer", label: "tool.audio_analyzer", Icon: MdGraphicEq },
            { key: "video_downloader", label: "tool.video_downloader", Icon: MdDownload },
            { key: "image_downloader", label: "tool.image_downloader", Icon: MdImage },
        ],
    },
];

export function Sidebar({
    active = "beatmap_clone",
    onChange,
    className = "",
    defaultExpanded = false,
}: SidebarProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const { t } = useI18n();

    const handleOpenAppFolder = async () => {
        try {
            const appDir = await appDataDir();
            await openPath(appDir);
        } catch (err) {
            console.error("Failed to open app folder:", err);
        }
    };

    return (
        <aside
            className={`h-full shrink-0 border-r border-border-muted bg-surface-sidebar text-text-primary flex flex-col transition-[width] duration-300 ease-in-out overflow-hidden ${isExpanded ? "w-56" : "w-16"
                } ${className}`}
        >
            <div className="border-b border-border-muted px-1 py-2">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="h-8 w-full rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-200 active:scale-95 flex items-center justify-center"
                    aria-label={isExpanded ? t("sidebar.action.collapse") : t("sidebar.action.expand")}
                >
                    {isExpanded ? (
                        <MdChevronLeft className="text-xl" />
                    ) : (
                        <MdChevronRight className="text-xl" />
                    )}
                </button>
            </div>

            <nav className="flex-1 px-2 py-2 space-y-4 overflow-y-auto overflow-x-hidden">
                {CATEGORIES.map((category, categoryIndex) => (
                    <div key={category.title}>
                        {isExpanded ? (
                            <div className="mb-2 px-3 text-xs font-bold uppercase tracking-wider text-text-muted whitespace-nowrap">
                                {t(category.title)}
                            </div>
                        ) : categoryIndex > 0 ? (
                            <div className="my-2 mx-auto h-px w-8 bg-border-muted" />
                        ) : null}

                        <div className="space-y-1">
                            {category.items.map(({ key, label, Icon }) => {
                                const isActive = active === key;
                                const translatedLabel = t(label);

                                return (
                                    <button
                                        key={key}
                                        aria-current={isActive ? "page" : undefined}
                                        onClick={() => onChange?.(key)}
                                        title={!isExpanded ? translatedLabel : undefined}
                                        className={`group w-full h-10 rounded-lg flex items-center transition-all duration-200 ease-out active:scale-95 ${isExpanded ? "px-3 gap-3" : "justify-center"
                                            } ${isActive
                                                ? "bg-surface-active text-text-primary shadow-inner"
                                                : "text-text-primary hover:bg-surface-hover"
                                            }`}
                                    >
                                        <Icon
                                            className={`text-xl transition-colors duration-200 shrink-0 ${isActive
                                                ? "text-text-primary"
                                                : "text-text-muted group-hover:text-text-primary"
                                                }`}
                                        />
                                        {isExpanded && (
                                            <span
                                                className={`font-semibold text-sm truncate whitespace-nowrap ${isActive
                                                    ? "text-text-primary"
                                                    : "text-text-secondary group-hover:text-text-primary"
                                                    }`}
                                            >
                                                {translatedLabel}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            <div className="border-t border-border-muted px-2 py-2">
                <button
                    onClick={handleOpenAppFolder}
                    title={!isExpanded ? t("sidebar.action.openAppFolder") : undefined}
                    className={`group w-full h-10 rounded-lg flex items-center text-text-primary hover:bg-surface-hover transition-all duration-200 ease-out active:scale-95 ${isExpanded ? "px-3 gap-3" : "justify-center"
                        }`}
                >
                    <MdFolderOpen className="text-xl text-text-muted group-hover:text-text-primary transition-colors duration-200 shrink-0" />
                    {isExpanded && (
                        <span className="font-semibold text-sm text-text-secondary group-hover:text-text-primary whitespace-nowrap">
                            {t("sidebar.action.openAppFolder")}
                        </span>
                    )}
                </button>
            </div>
        </aside>
    );
}
