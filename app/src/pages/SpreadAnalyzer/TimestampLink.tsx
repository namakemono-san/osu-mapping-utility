import { openUrl } from "@tauri-apps/plugin-opener";

export function formatOsuTimestamp(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    const millis = Math.floor(ms % 1000);
    return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}:${millis.toString().padStart(3, "0")}`;
}

export function TimestampLink({ ms }: { ms: number }) {
    const label = formatOsuTimestamp(ms);
    return (
        <button
            onClick={() => openUrl(`osu://edit/${label}`).catch(console.error)}
            className="font-mono text-blue-400 underline decoration-dotted hover:text-blue-300 cursor-pointer transition-colors"
        >
            {label}
        </button>
    );
}
