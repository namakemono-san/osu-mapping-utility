import { useEffect, useState } from "react";
import { getCurrentWindow } from '@tauri-apps/api/window';
import { FiX, FiMinus, FiMaximize, FiMinimize, FiBookOpen } from 'react-icons/fi';

// FiGlobe
// import { useI18n } from "../hooks/i18nContext";

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
            <div className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-[12px] px-2 py-1 text-sm text-white bg-[#2a2a2a] border border-zinc-600 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-[60] whitespace-nowrap">
                {label}
                <div className="absolute -top-[5px] left-1/2 -translate-x-1/2 w-2 h-2 bg-[#2a2a2a] border-l border-t border-zinc-600 rotate-45" />
            </div>
        </div>
    );
}

export function Titlebar() {
    const appWindow = getCurrentWindow();
    const [isMax, setIsMax] = useState(false);

    // const { lang, setLang } = useI18n();

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        (async () => {
            setIsMax(await appWindow.isMaximized());
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
            className="fixed top-0 left-0 w-full h-[40px] z-50 flex items-center pl-4 text-zinc-200 bg-[#131313] border-b border-zinc-800/70 select-none rounded-t-lg"
        >
            <span className="text-sm font-medium tracking-wide truncate">osu! mapping utility</span>

            <div className="flex-1" />

            <div className="flex items-center h-full" data-tauri-drag-region="false">
                <div className="flex gap-2" onDoubleClickCapture={(e) => e.stopPropagation()}>
                    <ToolButton icon={<FiBookOpen className="text-[18px]" />} label="Documentation" />
                    {/* <ToolButton
                        icon={<FiGlobe className="text-[18px]" />}
                        label={`Language: ${lang.toUpperCase()}`}
                        onClick={() => setLang(lang === "en" ? "ja" : "en")}
                    /> */}
                </div>

                <div className="w-px h-full bg-zinc-700/70 ml-2" />

                <div className="h-full flex">
                    <button
                        onClick={() => appWindow.minimize()}
                        className="h-full w-11 grid place-items-center hover:bg-zinc-700/60 transition-colors"
                    >
                        <FiMinus />
                    </button>
                    <button
                        onClick={async () => {
                            await appWindow.toggleMaximize();
                            setIsMax(await appWindow.isMaximized());
                        }}
                        className="h-full w-11 grid place-items-center hover:bg-zinc-700/60 transition-colors"
                    >
                        {isMax ? <FiMinimize /> : <FiMaximize />}
                    </button>
                    <button
                        onClick={() => appWindow.close()}
                        className="h-full w-11 grid place-items-center hover:bg-red-600/90 hover:text-white transition-colors"
                    >
                        <FiX />
                    </button>
                </div>
            </div>
        </div>
    );
}
