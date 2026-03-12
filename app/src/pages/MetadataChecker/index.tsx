import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { Card } from "../../components/Card";
import { CheckSummaryBar } from "./CheckSummaryBar";
import { CheckCategorySection } from "./CheckCategorySection";

import { Beatmapset } from "../../types/beatmap";
import { useSongsFolder } from "../../hooks/useStorage";
import { useI18n } from "../../hooks/i18nContext";
import { getModeName } from "../../domain/osu/rcDifficultyNames";
import { runAllChecks } from "../../domain/rc/checker";
import { requestParseBatch } from "../../utils/signalr";
import type { CheckResult, CheckCategory } from "../../domain/rc/types";
import type { GameMode, Beatmap } from "../../types/osu";
import type { LocaleKey } from "../../locale";

interface MetadataCheckerProps {
    selectedBeatmap?: Beatmapset | null;
}

const CATEGORY_ORDER: CheckCategory[] = [
    "general",
    "metadata",
    "audio",
    "files",
    "spread",
    "difficulty_settings",
];

type SeverityFilter = "all" | "rule" | "guideline";

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

    if (bitrateOk && cutoffOk) {
        return [{
            checkId: "audio.quality",
            messageKey: "rc.audio.quality.pass",
            messageParams: {
                format: recommendedFormat,
                bitrate: info.average_bitrate_kbps,
                cutoff: formatHz(info.frequency_cutoff_hz),
            },
            severity: "guideline",
            category: "audio",
            passed: true,
        }];
    }

    if (!cutoffOk) {
        return [{
            checkId: "audio.quality",
            messageKey: "rc.audio.quality.bloated",
            messageParams: {
                format: recommendedFormat,
                bitrate: info.average_bitrate_kbps,
                cutoff: formatHz(info.frequency_cutoff_hz),
                expected: formatHz(expectedCutoff),
            },
            severity: "rule",
            category: "audio",
            passed: false,
        }];
    }

    return [{
        checkId: "audio.quality",
        messageKey: "rc.audio.quality.bitrateHigh",
        messageParams: {
            format: recommendedFormat,
            bitrate: info.average_bitrate_kbps,
            max: maxBitrate,
            altFormat: alternativeFormat,
            altMax: alternativeMax,
        },
        severity: "guideline",
        category: "audio",
        passed: false,
    }];
}

function aggregateResults(results: CheckResult[], allDiffNames: string[]): CheckResult[] {
    const groups = new Map<string, CheckResult[]>();

    for (const r of results) {
        const key = `${r.checkId}|${r.passed}|${r.messageKey}|${JSON.stringify(r.messageParams ?? {})}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(r);
    }

    const aggregated: CheckResult[] = [];
    for (const group of groups.values()) {
        if (group.length === 1 || !group[0].difficultyName) {
            aggregated.push(...group);
            continue;
        }

        const diffNames = group.map(r => r.difficultyName!).filter(Boolean);
        const isAll = allDiffNames.length > 0 && diffNames.length >= allDiffNames.length;

        const merged: CheckResult = {
            ...group[0],
            difficultyName: undefined,
            difficultyNames: isAll ? undefined : diffNames,
        };
        aggregated.push(merged);
    }

    return aggregated;
}

export function MetadataChecker({ selectedBeatmap }: MetadataCheckerProps) {
    const { t } = useI18n();
    const [songsFolder] = useSongsFolder();

    const [loading, setLoading] = useState(false);
    const [asyncChecking, setAsyncChecking] = useState(false);
    const [beatmapsetData, setBeatmapsetData] = useState<Beatmap[] | null>(null);
    const [results, setResults] = useState<CheckResult[]>([]);

    const [showPassed, setShowPassed] = useState(false);
    const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
    const [diffFilter, setDiffFilter] = useState<string>("all");

    const cancelRef = useRef(false);

    const loadAndCheck = useCallback(async () => {
        if (!selectedBeatmap || !songsFolder) return;

        cancelRef.current = false;
        setLoading(true);
        setAsyncChecking(false);
        setBeatmapsetData(null);
        setResults([]);

        try {
            const beatmapFolder = `${songsFolder}\\${selectedBeatmap.folder_name}`;
            const data = await requestParseBatch(beatmapFolder, []);
            setBeatmapsetData(data);

            const checkResults = runAllChecks(data);
            setResults([...checkResults]);
            setLoading(false);
            setAsyncChecking(true);

            const audioFilename = data[0]?.general.audioFilename;

            const audioPromise = audioFilename
                ? invoke<AudioCheckInfo>("check_audio_info", {
                      filePath: `${beatmapFolder}\\${audioFilename}`,
                  })
                      .then(info => buildAudioCheckResults(info))
                      .catch(err => {
                          console.warn("[RC Checker] Audio check failed:", err);
                          return [] as CheckResult[];
                      })
                : Promise.resolve([] as CheckResult[]);

            const audioResults = await audioPromise;

            if (!cancelRef.current) {
                if (audioResults.length > 0) {
                    setResults(prev => [...prev, ...audioResults]);
                }
                setAsyncChecking(false);
            }
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

    const mode: GameMode = beatmapsetData?.[0]?.general.mode ?? 0;
    const diffNames = useMemo(() => {
        if (!beatmapsetData) return [];
        return [...new Set(beatmapsetData.map(d => d.metadata.version))];
    }, [beatmapsetData]);

    const aggregatedResults = useMemo(() => {
        return aggregateResults(results, diffNames);
    }, [results, diffNames]);

    const filteredResults = useMemo(() => {
        let filtered = results;

        if (!showPassed) {
            filtered = filtered.filter(r => !r.passed);
        }

        if (severityFilter !== "all") {
            filtered = filtered.filter(r => {
                if (severityFilter === "rule") return r.severity === "rule";
                return r.severity === "guideline" || r.severity === "warning";
            });
        }

        if (diffFilter !== "all") {
            filtered = filtered.filter(r => {
                if (!r.difficultyName && !r.difficultyNames) return true;
                if (r.difficultyName) return r.difficultyName === diffFilter;
                if (r.difficultyNames) return r.difficultyNames.includes(diffFilter);
                return true;
            });
        }

        return aggregateResults(filtered, diffNames);
    }, [results, showPassed, severityFilter, diffFilter, diffNames]);

    const groupedResults = useMemo(() => {
        const groups: Partial<Record<CheckCategory, CheckResult[]>> = {};
        for (const r of filteredResults) {
            if (!groups[r.category]) groups[r.category] = [];
            groups[r.category]!.push(r);
        }
        return groups;
    }, [filteredResults]);

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

    if (!beatmapsetData) return null;

    return (
        <div className="space-y-4 max-w-4xl mx-auto">
            <Card className="p-4">
                <h1 className="text-lg font-bold text-text-primary mb-1">
                    {t("rc.header.title")}
                </h1>
                <div className="flex flex-wrap gap-3 text-sm text-text-muted">
                    <span>{selectedBeatmap.title || selectedBeatmap.folder_name}</span>
                    <span>{t("rc.header.mode", { mode: getModeName(mode) })}</span>
                    <span>{t("rc.header.files", {
                        count: beatmapsetData.length,
                        plural: beatmapsetData.length === 1 ? "" : "s",
                    })}</span>
                </div>
            </Card>

            <CheckSummaryBar results={aggregatedResults} asyncChecking={asyncChecking} />

            <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                    <input
                        type="checkbox"
                        checked={showPassed}
                        onChange={e => setShowPassed(e.target.checked)}
                        className="rounded"
                    />
                    {t("rc.filter.showPassed")}
                </label>

                <div className="flex gap-1 ml-auto">
                    {(["all", "rule", "guideline"] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setSeverityFilter(f as SeverityFilter)}
                            className={`px-3 py-1 text-xs rounded-md transition-colors ${
                                severityFilter === f
                                    ? "bg-surface-active text-text-primary"
                                    : "text-text-muted hover:bg-surface-hover"
                            }`}
                        >
                            {t(`rc.filter.${f === "all" ? "all" : f === "rule" ? "rules" : "guidelines"}` as LocaleKey)}
                        </button>
                    ))}
                </div>

                {diffNames.length > 1 && (
                    <select
                        value={diffFilter}
                        onChange={e => setDiffFilter(e.target.value)}
                        className="h-8 px-2 rounded-md bg-surface-hover border border-border-strong text-sm text-text-primary"
                    >
                        <option value="all">{t("rc.filter.allDiffs")}</option>
                        {diffNames.map(name => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                )}
            </div>

            <div className="space-y-3">
                {CATEGORY_ORDER.map(cat => {
                    const catResults = groupedResults[cat];
                    if (!catResults || catResults.length === 0) return null;
                    return (
                        <CheckCategorySection
                            key={cat}
                            category={cat}
                            results={catResults}
                        />
                    );
                })}
            </div>

            {filteredResults.length === 0 && (
                <div className="text-center py-8 text-text-muted text-sm">
                    {showPassed ? t("rc.summary.passed", { count: 0 }) : t("rc.summary.passed", { count: aggregatedResults.filter(r => r.passed).length })}
                </div>
            )}
        </div>
    );
}
