import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FiX, FiChevronDown } from "react-icons/fi";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";

import { useI18n } from "../../hooks/i18nContext";
import { useAppState } from "../../hooks/appState";
import type { Lang } from "../../locale";

type UpdateStatus = "idle" | "checking" | "available" | "upToDate" | "error";

interface SettingsProps {
    isOpen: boolean;
    onClose: () => void;
}

export function Settings({ isOpen, onClose }: SettingsProps) {
    const { lang, setLang, t } = useI18n();
    const { songsFolder, setSongsFolder } = useAppState();

    const [mounted, setMounted] = useState(false);
    const [animateOut, setAnimateOut] = useState(false);
    const [isChangingFolder, setIsChangingFolder] = useState(false);
    const [version, setVersion] = useState("");
    const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");

    useEffect(() => {
        getVersion().then(setVersion).catch(() => {});
    }, []);

    useEffect(() => {
        if (isOpen) {
            setMounted(true);
            setAnimateOut(false);
        } else if (mounted) {
            setAnimateOut(true);
            const id = setTimeout(() => {
                setMounted(false);
                setAnimateOut(false);
            }, 200);
            return () => clearTimeout(id);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    useEffect(() => {
        if (!mounted) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [mounted, onClose]);

    const handleBrowse = async () => {
        setIsChangingFolder(true);
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: t("mapSelector.dialog.selectSongsFolder"),
                defaultPath: songsFolder || undefined,
            });
            if (selected && typeof selected === "string") {
                await invoke("reload_beatmapsets", { basePath: selected });
                setSongsFolder(selected);
            }
        } catch (err) {
            console.error("Failed to change songs folder:", err);
        } finally {
            setIsChangingFolder(false);
        }
    };

    const handleCheckUpdate = async () => {
        setUpdateStatus("checking");
        try {
            const update = await check();
            setUpdateStatus(update ? "available" : "upToDate");
        } catch {
            setUpdateStatus("error");
        }
    };

    if (!mounted) return null;

    const backdropCls = animateOut ? "settings-backdrop-out" : "settings-backdrop-in";
    const panelCls = animateOut ? "settings-panel-out" : "settings-panel-in";

    const updateStatusLabel =
        updateStatus === "checking" ? t("settings.updates.checking") :
        updateStatus === "available" ? t("settings.updates.available") :
        updateStatus === "upToDate" ? t("settings.updates.upToDate") :
        updateStatus === "error" ? t("settings.updates.failed") :
        null;

    const updateStatusColor =
        updateStatus === "available" ? "text-yellow-400" :
        updateStatus === "upToDate" ? "text-green-400" :
        updateStatus === "error" ? "text-red-400" : "";

    return createPortal(
        <div
            className={`${backdropCls} fixed inset-0 z-500 flex items-center justify-center`}
            style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className={`${panelCls} w-full max-w-120 mx-4 bg-surface-elevated rounded-xl shadow-2xl overflow-hidden`}>
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                    <span className="text-sm font-semibold text-white tracking-wide">
                        {t("settings.title")}
                    </span>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 grid place-items-center rounded-md text-zinc-500 hover:text-white hover:bg-zinc-700/60 transition-colors"
                    >
                        <FiX className="text-base" />
                    </button>
                </div>

                <div className="px-4 pb-2 space-y-4">
                    <div className="space-y-1.5">
                        <label className="block text-xs text-zinc-500 font-medium">
                            {t("settings.songsFolder.label")}
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                readOnly
                                value={songsFolder || ""}
                                placeholder={t("settings.songsFolder.notSet")}
                                className="flex-1 min-w-0 h-8 px-3 rounded-lg bg-zinc-800/80 border border-zinc-700/50 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none cursor-default select-none"
                            />
                            <button
                                onClick={handleBrowse}
                                disabled={isChangingFolder}
                                className="shrink-0 h-8 px-3 rounded-lg bg-zinc-700/60 hover:bg-zinc-600/60 text-zinc-200 hover:text-white text-xs font-semibold transition-colors disabled:opacity-40"
                            >
                                {t("settings.songsFolder.browse")}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="block text-xs text-zinc-500 font-medium">
                            {t("settings.language.label")}
                        </label>
                        <div className="relative inline-block">
                            <select
                                value={lang}
                                onChange={(e) => setLang(e.target.value as Lang)}
                                className="h-8 pl-3 pr-8 rounded-lg bg-zinc-800/80 border border-zinc-700/50 text-xs text-zinc-300 appearance-none cursor-pointer focus:outline-none focus:border-zinc-500 transition-colors"
                            >
                                <option value="en">English</option>
                                <option value="ja">日本語</option>
                            </select>
                            <FiChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-xs" />
                        </div>
                    </div>

                    <div className="h-px bg-zinc-800/70" />

                    <div className="flex items-center justify-between space-y-2">
                        <div className="items-center justify-between gap-3">
                            <p className="text-base font-bold uppercase tracking-widest text-white">
                                {t("settings.updates.title")}
                            </p>
                            <div className="text-sm text-zinc-400 leading-relaxed">
                                <span>{t("settings.updates.currentVersion")}: </span>
                                <span>{version || "—"}</span>
                                {updateStatusLabel && (
                                    <span className={`ml-2 ${updateStatusColor}`}> · {updateStatusLabel}</span>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={handleCheckUpdate}
                            disabled={updateStatus === "checking"}
                            className="shrink-0 h-8 px-3 rounded-lg bg-zinc-700/60 hover:bg-zinc-600/60 text-zinc-200 hover:text-white text-xs font-semibold transition-colors disabled:opacity-40 whitespace-nowrap"
                        >
                            {t("settings.updates.check")}
                        </button>
                    </div>

                </div>
            </div>
        </div>,
        document.body
    );
}
