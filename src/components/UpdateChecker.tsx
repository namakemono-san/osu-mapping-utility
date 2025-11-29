import { useEffect, useState, useCallback, useMemo } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { FiDownload } from "react-icons/fi";
import { Button } from "../components/common/Button";
import { Modal } from "../components/common/Modal";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { ProgressBar } from "../components/common/ProgressBar";
import { StatusMessage } from "../components/common/StatusMessage";

interface DownloadProgress {
    downloaded: number;
    contentLength: number | null;
    percentage: number;
}

export function UpdateChecker() {
    const [checking, setChecking] = useState(false);
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [updateInfo, setUpdateInfo] = useState<{
        version: string;
        notes: string;
        date: string;
    } | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [progress, setProgress] = useState<DownloadProgress>({
        downloaded: 0,
        contentLength: null,
        percentage: 0,
    });
    const [error, setError] = useState<string | null>(null);

    const downloadAndInstallUpdate = useCallback(async () => {
        if (!updateAvailable) return;

        setDownloading(true);
        setError(null);

        try {
            const update = await check();
            if (!update) return;

            let downloaded = 0;
            let totalSize: number | null = null;

            await update.downloadAndInstall((event) => {
                switch (event.event) {
                    case "Started":
                        totalSize = event.data.contentLength ?? null;
                        setProgress({
                            downloaded: 0,
                            contentLength: totalSize,
                            percentage: 0,
                        });
                        break;

                    case "Progress":
                        downloaded += event.data.chunkLength;
                        const percentage = totalSize
                            ? Math.round((downloaded / totalSize) * 100)
                            : 0;
                        setProgress({
                            downloaded,
                            contentLength: totalSize,
                            percentage,
                        });
                        break;

                    case "Finished":
                        setProgress((prev) => ({ ...prev, percentage: 100 }));
                        break;
                }
            });

            await relaunch();
        } catch (err) {
            console.error("Update error:", err);
            setError("Failed to install update");
            setDownloading(false);
        }
    }, [updateAvailable]);

    const dismissUpdate = useCallback(() => {
        setUpdateAvailable(false);
        setUpdateInfo(null);
    }, []);

    const formatBytes = useCallback((bytes: number): string => {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
    }, []);

    const formattedDate = useMemo(() => {
        if (!updateInfo?.date) return null;
        return new Date(updateInfo.date).toLocaleDateString("en-US");
    }, [updateInfo?.date]);

    const progressInfo = useMemo(() => {
        if (!progress.contentLength) return null;
        return `${formatBytes(progress.downloaded)} / ${formatBytes(progress.contentLength)}`;
    }, [progress.downloaded, progress.contentLength, formatBytes]);

    useEffect(() => {
        let mounted = true;

        async function checkForUpdates() {
            if (checking) return;

            setChecking(true);
            setError(null);

            try {
                const update = await check();

                if (!mounted) return;

                if (update) {
                    setUpdateAvailable(true);
                    setUpdateInfo({
                        version: update.version,
                        notes: update.body || "No release notes available",
                        date: update.date || "",
                    });
                }
            } catch (err) {
                if (!mounted) return;
                console.error("Update check error:", err);
                setError("Failed to check for updates");
            } finally {
                if (mounted) {
                    setChecking(false);
                }
            }
        }

        checkForUpdates();

        return () => {
            mounted = false;
        };
    }, []);

    if (checking) {
        return (
            <Modal isOpen={true} onClose={() => { }} title="" hideCloseButton>
                <LoadingSpinner label="Checking for updates..." />
            </Modal>
        );
    }

    if (downloading) {
        return (
            <Modal isOpen={true} onClose={() => { }} title="Downloading Update" hideCloseButton>
                <div className="space-y-4">
                    <ProgressBar percentage={progress.percentage} />
                    <div className="flex justify-between text-sm text-[#7b7b7b]">
                        <span>{progress.percentage}%</span>
                        {progressInfo && <span>{progressInfo}</span>}
                    </div>
                    <p className="text-xs text-[#7b7b7b]">
                        The app will restart automatically after installation
                    </p>
                </div>
            </Modal>
        );
    }

    if (updateAvailable && updateInfo) {
        return (
            <Modal isOpen={true} onClose={dismissUpdate} title="Update Available">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-[#7b7b7b]">Version:</span>
                            <span className="text-sm text-white font-medium">
                                {updateInfo.version}
                            </span>
                        </div>

                        {formattedDate && (
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-[#7b7b7b]">Release Date:</span>
                                <span className="text-sm text-white">{formattedDate}</span>
                            </div>
                        )}

                        <div className="p-3 bg-[#101010] border border-[#2a2a2a] rounded-lg max-h-40 overflow-y-auto">
                            <p className="text-sm text-[#e0e0e0] whitespace-pre-wrap">
                                {updateInfo.notes}
                            </p>
                        </div>
                    </div>

                    {error && <StatusMessage type="error" message={error} />}

                    <div className="flex gap-2">
                        <Button
                            variant="primary"
                            icon={<FiDownload />}
                            onClick={downloadAndInstallUpdate}
                            className="flex-1"
                        >
                            Install
                        </Button>
                        <Button variant="secondary" onClick={dismissUpdate} className="flex-1">
                            Later
                        </Button>
                    </div>
                </div>
            </Modal>
        );
    }

    return null;
}