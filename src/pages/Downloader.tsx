import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { FiLink, FiFolder, FiDownload, FiFilm, FiMusic, FiTrash2 } from "react-icons/fi";

import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { Input } from "../components/common/Input";
import { Select } from "../components/common/Select";
import { Switch } from "../components/common/Switch";
import { Chip } from "../components/common/Chip";

export function Downloader() {
    const [url, setUrl] = useState("");
    const [outDir, setOutDir] = useState("");
    const [audioFormat, setAudioFormat] = useState<"mp3" | "ogg">("mp3");
    const [includeVideo, setIncludeVideo] = useState(false);
    const [busy, setBusy] = useState(false);
    const [log, setLog] = useState("");
    const logRef = useRef<HTMLPreElement | null>(null);

    useEffect(() => {
        let off: (() => void) | undefined;
        listen<string>("download-progress", (e) => {
            const line = typeof e.payload === "string" ? e.payload : JSON.stringify(e.payload);
            setLog((p) => p + line);
        }).then((un) => (off = un));
        return () => off?.();
    }, []);

    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [log]);

    const pickDir = async () => {
        const d = await open({ directory: true, multiple: false, title: "Select output folder" });
        if (typeof d === "string") setOutDir(d);
    };

    const start = async () => {
        if (!url.trim()) return alert("Enter a URL");
        if (!outDir.trim()) return alert("Select an output folder");
        setBusy(true);
        try {
            const res = await invoke<string>("run_download", {
                url,
                outDir,
                audioFormat,
                includeVideo,
            });
            if (res !== "started") setLog((p) => p + res);
        } catch (e: any) {
            setLog((p) => p + `[ui][err] ${String(e)}`);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex flex-col gap-2 text-zinc-200">
            <Card className="flex items-center gap-2 p-2">
                <div className="flex items-center gap-2 px-3 h-9 rounded-lg bg-[#1f1f1f] border border-[#2a2a2a] w-full max-w-[min(60%,720px)]">
                    <FiLink className="text-[#7b7b7b] flex-shrink-0" />
                    <Input
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                        disabled={busy}
                        className="bg-transparent border-0 h-auto px-0 focus:border-0"
                    />
                </div>

                <Select
                    value={audioFormat}
                    onChange={(e) => setAudioFormat(e.target.value as "mp3" | "ogg")}
                    disabled={busy}
                    icon={<FiMusic />}
                    className="min-w-[220px]"
                >
                    <option value="mp3">MP3 (192 kbps)</option>
                    <option value="ogg">OGG Vorbis (208 kbps)</option>
                </Select>

                <div className="flex-1" />

                <Button
                    variant="secondary"
                    icon={<FiFolder />}
                    onClick={pickDir}
                    disabled={busy}
                    title="Select output folder"
                >
                    Folder
                </Button>

                <Button
                    variant="primary"
                    icon={<FiDownload />}
                    onClick={start}
                    disabled={busy}
                    title="Start download"
                >
                    {busy ? "Working..." : "Start"}
                </Button>
            </Card>

            <Card className="flex items-center gap-2 p-2">
                <Chip
                    icon={<FiFolder />}
                    className="min-w-0 max-w-[min(60%,720px)]"
                    title={outDir || "No folder selected"}
                >
                    {outDir || "No folder selected"}
                </Chip>

                <Switch
                    checked={includeVideo}
                    onChange={setIncludeVideo}
                    label="Include muted video"
                    icon={<FiFilm />}
                    disabled={busy}
                />

                <div className="flex-1" />

                <Button
                    variant="danger"
                    icon={<FiTrash2 />}
                    onClick={() => setLog("")}
                    disabled={busy && !log}
                    title="Clear log"
                >
                    Clear
                </Button>
            </Card>

            <Card className="flex flex-col">
                <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a2a]">
                    <span className="text-sm opacity-80">Log</span>
                    <span className="text-xs opacity-60">
                        Format: {audioFormat.toUpperCase()} {includeVideo ? "+ Video" : ""}
                    </span>
                </div>
                <pre
                    ref={logRef}
                    className="font-mono text-sm whitespace-pre-wrap px-3 py-2 h-[62vh] overflow-auto"
                >
                    {log || "Ready."}
                </pre>
            </Card>
        </div>
    );
}