import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { Card } from "../../components/Card";
import { CheckSummaryBar } from "./CheckSummaryBar";
import { CheckCategorySection } from "./CheckCategorySection";

import { Beatmapset } from "../../types/beatmap";
import { useSongsFolder } from "../../hooks/useStorage";
import { useI18n } from "../../hooks/i18nContext";
import { requestParseBatch, requestRunChecks } from "../../utils/signalr";
import type { CheckResult, IssueResult } from "../../domain/rc/types";

interface MetadataCheckerProps {
    selectedBeatmap?: Beatmapset | null;
}

interface AudioCheckInfo {
    format: string;
    average_bitrate_kbps: number;
    frequency_cutoff_hz: number;
    sample_rate: number;
    duration_seconds: number;
}

function formatHz(hz: number): string {
    return `${(hz / 1000).toFixed(1)} kHz`;
}

function buildAudioCheckResults(info: AudioCheckInfo): CheckResult[] {
    const isOgg = info.format === "ogg";
    const maxBitrate = isOgg ? 208 : 192;
    const recommendedFormat = isOgg ? "OGG" : "MP3";
    const alternativeFormat = isOgg ? "MP3" : "OGG";
    const alternativeMax = isOgg ? 192 : 208;

    let expectedCutoff: number;
    if (isOgg) {
        if (info.average_bitrate_kbps <= 128) expectedCutoff = 15000;
        else if (info.average_bitrate_kbps <= 192) expectedCutoff = 16000;
        else expectedCutoff = 18000;
    } else {
        if (info.average_bitrate_kbps <= 128) expectedCutoff = 16000;
        else if (info.average_bitrate_kbps <= 192) expectedCutoff = 18000;
        else expectedCutoff = 19500;
    }

    const bitrateOk = info.average_bitrate_kbps <= maxBitrate;
    const cutoffOk = info.frequency_cutoff_hz >= expectedCutoff;

    const makeIssue = (msg: string, level: "Warning" | "Problem"): IssueResult => ({
        level,
        formattedMessage: msg,
        beatmapVersion: null,
    });

    if (bitrateOk && cutoffOk) {
        return [{
            checkId: "audio.quality",
            category: "Audio",
            message: "Audio quality check.",
            scope: "general",
            beatmapVersion: null,
            passed: true,
            issues: [],
        }];
    }

    if (!cutoffOk) {
        return [{
            checkId: "audio.quality",
            category: "Audio",
            message: "Audio quality check.",
            scope: "general",
            beatmapVersion: null,
            passed: false,
            issues: [makeIssue(
                `${recommendedFormat} ${info.average_bitrate_kbps} kbps — may be bloated (cutoff ${formatHz(info.frequency_cutoff_hz)}, expected ≥${formatHz(expectedCutoff)})`,
                "Problem",
            )],
        }];
    }

    return [{
        checkId: "audio.quality",
        category: "Audio",
        message: "Audio quality check.",
        scope: "general",
        beatmapVersion: null,
        passed: false,
        issues: [makeIssue(
            `${recommendedFormat} ${info.average_bitrate_kbps} kbps exceeds ≤${maxBitrate} kbps — consider ${alternativeFormat} (≤${alternativeMax} kbps)`,
            "Warning",
        )],
    }];
}

export function MetadataChecker({ selectedBeatmap }: MetadataCheckerProps) {
    const { t } = useI18n();
    const [songsFolder] = useSongsFolder();

    const [loading, setLoading] = useState(false);
    const [asyncChecking, setAsyncChecking] = useState(false);
    const [diffNames, setDiffNames] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<string>("general");
    const [allChecks, setAllChecks] = useState<CheckResult[]>([]);
    const [showPassed, setShowPassed] = useState(false);
    const [modeError, setModeError] = useState<string | null>(null);

    const cancelRef = useRef(false);

    const loadAndCheck = useCallback(async () => {
        if (!selectedBeatmap || !songsFolder) return;

        cancelRef.current = false;
        setLoading(true);
        setAsyncChecking(false);
        setDiffNames([]);
        setActiveTab("general");
        setAllChecks([]);
        setModeError(null);

        try {
            const beatmapFolder = `${songsFolder}\\${selectedBeatmap.folder_name}`;
            const beatmaps = await requestParseBatch(beatmapFolder, []);

            if (beatmaps.length > 0 && beatmaps[0].general.mode !== 1) {
                setModeError(t("rc.modeNotSupported"));
                setLoading(false);
                return;
            }

            const names = [...new Set(beatmaps.map(b => b.metadata.version))];
            setDiffNames(names);

            const response = await requestRunChecks(beatmapFolder, []);
            setAllChecks([...response.checks]);
            setLoading(false);
            setAsyncChecking(true);

            const audioFilename = beatmaps[0]?.general.audioFilename;
            if (audioFilename) {
                const audioResults = await invoke<AudioCheckInfo>("check_audio_info", {
                    filePath: `${beatmapFolder}\\${audioFilename}`,
                })
                    .then(info => buildAudioCheckResults(info))
                    .catch(err => {
                        console.warn("[RC Checker] Audio check failed:", err);
                        return [] as CheckResult[];
                    });

                if (!cancelRef.current && audioResults.length > 0) {
                    setAllChecks(prev => [...prev, ...audioResults]);
                }
            }

            if (!cancelRef.current) setAsyncChecking(false);
        } catch (err) {
            console.error("[RC Checker] Error:", err);
            setLoading(false);
            setAsyncChecking(false);
        }
    }, [selectedBeatmap, songsFolder]);

    useEffect(() => {
        loadAndCheck();
        return () => { cancelRef.current = true; };
    }, [loadAndCheck]);

    const tabFailCounts = useMemo(() => {
        const counts: Record<string, number> = { general: 0 };
        for (const c of allChecks) {
            if (c.issues.length === 0) continue;
            if (c.scope === "general" || c.scope === "set") {
                counts["general"] = (counts["general"] ?? 0) + 1;
            } else if (c.scope === "beatmap" && c.beatmapVersion) {
                counts[c.beatmapVersion] = (counts[c.beatmapVersion] ?? 0) + 1;
            }
        }
        return counts;
    }, [allChecks]);

    const tabChecks = useMemo(() => {
        if (activeTab === "general") {
            return allChecks.filter(c => c.scope === "general" || c.scope === "set");
        }
        return allChecks.filter(c => c.scope === "beatmap" && c.beatmapVersion === activeTab);
    }, [allChecks, activeTab]);

    const filteredChecks = useMemo(() => {
        return showPassed ? tabChecks : tabChecks.filter(c => c.issues.length > 0);
    }, [tabChecks, showPassed]);

    const groupedByCategory = useMemo(() => {
        const groups = new Map<string, CheckResult[]>();
        for (const c of filteredChecks) {
            if (!groups.has(c.category)) groups.set(c.category, []);
            groups.get(c.category)!.push(c);
        }
        return groups;
    }, [filteredChecks]);

    const categoryOrder = ["General", "Metadata", "Timing", "Settings", "Spread", "Audio"];

    if (!selectedBeatmap) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-text-muted">{t("rc.empty.selectBeatmap")}</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-text-muted animate-pulse">{t("rc.loading")}</p>
            </div>
        );
    }

    if (modeError) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-text-muted">{modeError}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4 max-w-4xl mx-auto">
            <Card className="p-4">
                <h1 className="text-lg font-bold text-text-primary mb-1">
                    {t("rc.header.title")}
                </h1>
                <div className="flex flex-wrap gap-3 text-sm text-text-muted">
                    <span>{selectedBeatmap.title || selectedBeatmap.folder_name}</span>
                    <span>osu!taiko</span>
                    <span>{t("rc.header.files", {
                        count: diffNames.length,
                        plural: diffNames.length === 1 ? "" : "s",
                    })}</span>
                </div>
            </Card>

            <CheckSummaryBar results={allChecks} asyncChecking={asyncChecking} />

            <div className="flex gap-1 flex-wrap border-b border-border-muted">
                {(["general", ...diffNames] as string[]).map(tab => {
                    const isActive = activeTab === tab;
                    const label = tab === "general" ? t("rc.tab.general") : tab;
                    const failCount = tabFailCounts[tab] ?? 0;
                    return (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={[
                                "relative flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors",
                                "border-b-2 -mb-px",
                                isActive
                                    ? "border-accent text-text-primary"
                                    : "border-transparent text-text-muted hover:text-text-secondary hover:border-border-strong",
                            ].join(" ")}
                        >
                            {label}
                            {failCount > 0 && (
                                <span className={[
                                    "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] tabular-nums",
                                    isActive
                                        ? "bg-red-500 text-white"
                                        : "bg-red-500/70 text-white",
                                ].join(" ")}
                                    style={{ lineHeight: "18px" }}>
                                    {failCount}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="flex items-center">
                <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                    <input
                        type="checkbox"
                        checked={showPassed}
                        onChange={e => setShowPassed(e.target.checked)}
                        className="rounded"
                    />
                    {t("rc.filter.showPassed")}
                </label>
            </div>

            <div className="space-y-3">
                {categoryOrder.map(cat => {
                    const catChecks = groupedByCategory.get(cat);
                    if (!catChecks || catChecks.length === 0) return null;
                    return (
                        <CheckCategorySection
                            key={cat}
                            category={cat}
                            results={catChecks}
                        />
                    );
                })}
                {[...groupedByCategory.entries()]
                    .filter(([cat]) => !categoryOrder.includes(cat))
                    .map(([cat, checks]) => (
                        <CheckCategorySection key={cat} category={cat} results={checks} />
                    ))
                }
            </div>

            {filteredChecks.length === 0 && (
                <div className="text-center py-8 text-text-muted text-sm">
                    {showPassed
                        ? t("rc.empty.noChecks")
                        : t("rc.summary.passed", { count: tabChecks.filter(c => c.passed).length })}
                </div>
            )}
        </div>
    );
}
