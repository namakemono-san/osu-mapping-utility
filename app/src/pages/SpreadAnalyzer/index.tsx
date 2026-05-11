import { useCallback, useEffect, useState } from "react";

import { Card } from "../../components/Card";
import { SubtabOdHp } from "./SubtabOdHp";
import { SubtabNoteCount } from "./SubtabNoteCount";
import { SubtabDensity } from "./SubtabDensity";
import { SubtabFinishers } from "./SubtabFinishers";
import { SubtabScrollSpeed } from "./SubtabScrollSpeed";

import { Beatmapset } from "../../types/beatmap";
import { useSongsFolder } from "../../hooks/useStorage";
import { useI18n } from "../../hooks/i18nContext";
import { requestParseBatch } from "../../utils/signalr";
import { sortDifficulties } from "../../domain/osu/difficultyUtils";
import { computeSpreadResults, type SpreadDiffResult } from "./spreadLogic";

interface SpreadAnalyzerProps {
    selectedBeatmap?: Beatmapset | null;
}

type TabKey = "odhp" | "noteCount" | "density" | "finishers" | "scrollSpeed";

export function SpreadAnalyzer({ selectedBeatmap }: SpreadAnalyzerProps) {
    const { t } = useI18n();
    const [songsFolder] = useSongsFolder();
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<SpreadDiffResult[]>([]);
    const [modeError, setModeError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabKey>("odhp");

    const loadAndAnalyze = useCallback(async () => {
        if (!selectedBeatmap || !songsFolder) return;
        setLoading(true);
        setResults([]);
        setModeError(null);
        try {
            const folder = `${songsFolder}\\${selectedBeatmap.folder_name}`;
            const beatmaps = await requestParseBatch(folder, []);
            if (beatmaps.length > 0 && beatmaps[0].general.mode !== 1) {
                setModeError(t("spread.modeNotSupported"));
                setLoading(false);
                return;
            }
            const { sorted } = sortDifficulties(beatmaps);
            setResults(computeSpreadResults(sorted));
        } catch (err) {
            console.error("[Spread Analyzer] Error:", err);
        } finally {
            setLoading(false);
        }
    }, [selectedBeatmap, songsFolder, t]);

    useEffect(() => {
        loadAndAnalyze();
    }, [loadAndAnalyze]);

    const tabs: { key: TabKey; label: string }[] = [
        { key: "odhp", label: t("spread.tab.odhp") },
        { key: "noteCount", label: t("spread.tab.noteCount") },
        { key: "density", label: t("spread.tab.density") },
        { key: "finishers", label: t("spread.tab.finishers") },
        { key: "scrollSpeed", label: t("spread.tab.scrollSpeed") },
    ];

    if (!selectedBeatmap) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-text-muted">{t("spread.empty.selectBeatmap")}</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-text-muted animate-pulse">{t("spread.loading")}</p>
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
                    {t("spread.header.title")}
                </h1>
                <div className="flex flex-wrap gap-3 text-sm text-text-muted">
                    <span>{selectedBeatmap.title || selectedBeatmap.folder_name}</span>
                    <span>osu!taiko</span>
                    <span>{t("spread.header.files", {
                        count: results.length,
                        plural: results.length === 1 ? "" : "s",
                    })}</span>
                </div>
            </Card>

            <div className="flex gap-1 flex-wrap border-b border-border-muted">
                {tabs.map(tab => {
                    const isActive = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={[
                                "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                                isActive
                                    ? "border-accent text-text-primary"
                                    : "border-transparent text-text-muted hover:text-text-secondary hover:border-border-strong",
                            ].join(" ")}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            <Card className="p-4">
                {activeTab === "odhp"       && <SubtabOdHp results={results} />}
                {activeTab === "noteCount"   && <SubtabNoteCount results={results} />}
                {activeTab === "density"     && <SubtabDensity results={results} />}
                {activeTab === "finishers"   && <SubtabFinishers results={results} />}
                {activeTab === "scrollSpeed" && <SubtabScrollSpeed results={results} />}
            </Card>
        </div>
    );
}
