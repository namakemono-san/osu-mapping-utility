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
} from "react-icons/md";
import { appDataDir } from "@tauri-apps/api/path";
import { openPath } from '@tauri-apps/plugin-opener';

export type SidebarKey =
    | "beatmap_clone"
    | "beatmap_preview"
    | "beatmap_customizer"
    | "offset_calibrator"
    | "metadata_editor"
    | "downloader"

type SidebarProps = {
    active?: SidebarKey;
    onChange?: (key: SidebarKey) => void;
    className?: string;
    defaultExpanded?: boolean;
};

type SidebarItem = {
    key: SidebarKey;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
};

type SidebarCategory = {
    title: string;
    items: SidebarItem[];
};

const CATEGORIES: SidebarCategory[] = [
    {
        title: "Map Tools",
        items: [
            { key: "beatmap_clone", label: "Beatmap Clone", Icon: MdContentCopy },
            { key: "beatmap_preview", label: "Beatmap Preview", Icon: MdRemoveRedEye },
            { key: "beatmap_customizer", label: "Beatmap Customizer", Icon: MdContentCut },
            { key: "metadata_editor", label: "Metadata Editor", Icon: MdEdit },
        ],
    },
    {
        title: "Utilities",
        items: [
            { key: "offset_calibrator", label: "Offset Calibrator", Icon: MdSpeed },
            { key: "downloader", label: "Downloader", Icon: MdDownload }
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
            className={`h-full shrink-0 bg-[#191919] text-[#eeeeee] border-r border-[#2a2a2a] flex flex-col transition-all duration-300 ease-in-out ${isExpanded ? "w-56" : "w-16"
                } ${className}`}
        >
            <div className="px-2 py-2 border-b border-[#2a2a2a]">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full h-9 flex items-center justify-center rounded-lg text-[#7b7b7b] hover:bg-[#2a2a2a] hover:text-[#eeeeee] transition-all duration-200 active:scale-95"
                    aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
                >
                    {isExpanded ? (
                        <MdChevronLeft className="text-xl" />
                    ) : (
                        <MdChevronRight className="text-xl" />
                    )}
                </button>
            </div>

            <nav className="flex-1 px-2 py-2 space-y-4 overflow-y-auto">
                {CATEGORIES.map((category, categoryIndex) => (
                    <div key={category.title}>
                        {isExpanded && (
                            <div className="px-3 mb-2 text-xs font-bold text-[#7b7b7b] uppercase tracking-wider">
                                {category.title}
                            </div>
                        )}

                        {!isExpanded && categoryIndex > 0 && (
                            <div className="my-2 mx-auto w-8 h-px bg-[#2a2a2a]" />
                        )}

                        <div className="space-y-1">
                            {category.items.map(({ key, label, Icon }) => {
                                const isActive = active === key;

                                return (
                                    <button
                                        key={key}
                                        aria-current={isActive ? "page" : undefined}
                                        onClick={() => onChange?.(key)}
                                        title={!isExpanded ? label : undefined}
                                        className={`group w-full h-10 rounded-lg flex items-center transition-all duration-200 ease-out active:scale-95 ${isExpanded ? "px-3 gap-3" : "justify-center"
                                            } ${isActive
                                                ? "bg-[#2f2f2f] text-[#eeeeee] shadow-inner"
                                                : "text-[#eeeeee] hover:bg-[#2a2a2a]"
                                            }`}
                                    >
                                        <Icon
                                            className={`text-xl transition-colors duration-200 flex-shrink-0 ${isActive
                                                ? "text-[#eeeeee]"
                                                : "text-[#7b7b7b] group-hover:text-[#eeeeee]"
                                                }`}
                                        />
                                        {isExpanded && (
                                            <span
                                                className={`font-semibold text-sm truncate transition-colors duration-200 ${isActive
                                                    ? "text-[#eeeeee]"
                                                    : "text-[#e0e0e0] group-hover:text-[#eeeeee]"
                                                    }`}
                                            >
                                                {label}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            <div className="px-2 py-2 border-t border-[#2a2a2a]">
                <button
                    onClick={handleOpenAppFolder}
                    title={!isExpanded ? "Open App Folder" : undefined}
                    className={`group w-full h-10 rounded-lg flex items-center text-[#eeeeee] hover:bg-[#2a2a2a] transition-all duration-200 ease-out active:scale-95 ${isExpanded ? "px-3 gap-3" : "justify-center"
                        }`}
                >
                    <MdFolderOpen className="text-xl text-[#7b7b7b] group-hover:text-[#eeeeee] transition-colors duration-200 flex-shrink-0" />
                    {isExpanded && (
                        <span className="font-semibold text-sm text-[#e0e0e0] group-hover:text-[#eeeeee] transition-colors duration-200">
                            Open App Folder
                        </span>
                    )}
                </button>
            </div>
        </aside>
    );
}