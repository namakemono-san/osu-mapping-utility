import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { ask } from "@tauri-apps/plugin-dialog";

export function UpdateChecker() {
    const [checking, setChecking] = useState(false);
    const [_updateAvailable, setUpdateAvailable] = useState(false);

    useEffect(() => {
        checkForUpdates();
    }, []);

    async function checkForUpdates() {
        if (checking) return;

        setChecking(true);
        try {
            const update = await check();

            if (update != null) {
                setUpdateAvailable(true);
                const yes = await ask(
                    `A new version ${update.version} is available!\n\nWhat's new:\n${update.body}\n\nWould you like to install the update?`,
                    {
                        title: "Update Available",
                        kind: "info",
                        okLabel: "Install",
                        cancelLabel: "Later",
                    }
                );

                if (yes) {
                    await update.downloadAndInstall();
                    await relaunch();
                }
            } else {
                console.log("You're up to date!");
            }
        } catch (error) {
            console.error("Update check error:", error);
        } finally {
            setChecking(false);
        }
    }

    return null;
}