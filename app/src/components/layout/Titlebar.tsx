import { useEffect, useState } from "react";
import { getVersion } from '@tauri-apps/api/app';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { FiX, FiMinus, FiMaximize, FiMinimize, FiSettings } from 'react-icons/fi';

import { useI18n } from "../../hooks/i18nContext";

function ToolButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
    return (
        <div className="relative group">
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onClick?.();
                }}
                className="w-8 h-8 grid place-items-center rounded-md text-zinc-300 hover:bg-zinc-800/70 hover:text-white transition-colors"
            >
                {icon}
            </button>
            <div className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-3 px-2 py-1 text-sm text-white bg-surface-hover border border-zinc-600 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-60 whitespace-nowrap">
                {label}
                <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-surface-hover border-l border-t border-zinc-600 rotate-45" />
            </div>
        </div>
    );
}

export function Titlebar({ onOpenSettings }: { onOpenSettings?: () => void }) {
    const appWindow = getCurrentWindow();
    const [isMax, setIsMax] = useState(false);
    const [version, setVersion] = useState<string>("");

    const { t } = useI18n();

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        (async () => {
            setIsMax(await appWindow.isMaximized());
            setVersion(await getVersion());
            unlisten = await appWindow.onResized(async () => {
                setIsMax(await appWindow.isMaximized());
            });
        })();
        return () => { if (unlisten) unlisten(); };
    }, []);

    return (
        <div
            data-tauri-drag-region
            onDoubleClick={() => appWindow.toggleMaximize()}
            className={`fixed top-0 left-0 w-full h-8 z-50 flex items-center pl-4 text-zinc-200 bg-surface-elevated border-b border-zinc-800/70 select-none ${isMax ? '' : 'rounded-t-lg'}`}
        >
            <span data-tauri-drag-region className="text-base tracking-wide truncate">
                osu! mapping utility
            </span>
            {version && <span data-tauri-drag-region className="text-base tracking-wide truncate opacity-65 ml-2">v{version}</span>}

            <div data-tauri-drag-region className="flex-1" />

            <div className="flex items-center h-full" data-tauri-drag-region="false">
                <div className="flex gap-2" onDoubleClickCapture={(e) => e.stopPropagation()}>
                    <ToolButton
                        icon={<FiSettings className="text-18" />}
                        label={t("titlebar.settings")}
                        onClick={() => onOpenSettings?.()}
                    />
                </div>

                <div className="w-px h-full bg-zinc-700/70 ml-2" />

                <div className="h-full flex">
                    <button
                        onClick={() => appWindow.minimize()}
                        className="h-full w-9 grid place-items-center hover:bg-zinc-700/60 transition-colors"
                    >
                        <FiMinus />
                    </button>
                    <button
                        onClick={async () => {
                            await appWindow.toggleMaximize();
                            setIsMax(await appWindow.isMaximized());
                        }}
                        className="h-full w-9 grid place-items-center hover:bg-zinc-700/60 transition-colors"
                    >
                        {isMax ? <FiMinimize /> : <FiMaximize />}
                    </button>
                    <button
                        onClick={() => appWindow.close()}
                        className="h-full w-9 grid place-items-center hover:bg-red-500/20 hover:text-white transition-colors"
                    >
                        <FiX />
                    </button>
                </div>
            </div>
        </div>
    );
}
