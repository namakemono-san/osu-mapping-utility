import type { TaikoDifficulty } from "../../domain/osu/taikoMapper";
import type { OsuTimingPoint } from "../../domain/osu/types";
import type { LocaleKey } from "../../locale";

interface ModState { isDT: boolean; isHR: boolean; }

export interface DebugPanelProps {
    t: (key: LocaleKey, params?: Record<string, string | number>) => string;
    isGameplayMode: boolean;
    mods: ModState;
    currentTime: number;
    getCurrentTimeMs: () => number;
    audioLeadIn: number;
    hitWindow: number;
    filteredDifficulties: TaikoDifficulty[];
    getCurrentBPM: (time: number, timingPoints: OsuTimingPoint[]) => number;
    getCurrentSV: (time: number, timingPoints: OsuTimingPoint[]) => number;
    debugInfo: string[];
    beatmapData: { difficulties: TaikoDifficulty[] } | null;
}

export function DebugPanel({
    t,
    isGameplayMode,
    mods,
    currentTime,
    getCurrentTimeMs,
    audioLeadIn,
    hitWindow,
    filteredDifficulties,
    getCurrentBPM,
    getCurrentSV,
    debugInfo,
    beatmapData,
}: DebugPanelProps) {
    return (
        <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-3">
            <div className="text-xs font-mono text-[#7b7b7b] space-y-1">
                <div className="text-[#e0e0e0] mb-2">{t("preview.debug.title")}</div>
                <div>
                    {t("preview.debug.mode")} {isGameplayMode ? t("preview.debug.gameplay") : t("preview.debug.edit")}
                </div>
                <div>{t("preview.debug.mods")} {[
                    mods.isDT && "DT",
                    mods.isHR && "HR"
                ].filter(Boolean).join(", ") || t("preview.debug.none")}</div>
                <div>{t("preview.debug.currentTime", { ms: currentTime.toFixed(1) })}</div>
                <div>{t("preview.debug.rawAudioTime", { ms: getCurrentTimeMs().toFixed(1) })}</div>
                <div>{t("preview.debug.audioLeadIn", { ms: audioLeadIn })}</div>
                <div>{t("preview.debug.hitWindow", { ms: hitWindow })}</div>
                {isGameplayMode && beatmapData && filteredDifficulties.length > 0 && (
                    <>
                        <div>{t("preview.debug.currentBpm", { bpm: getCurrentBPM(currentTime, filteredDifficulties[0].timingPoints) })}</div>
                        <div>{t("preview.debug.currentSv", { sv: getCurrentSV(currentTime, filteredDifficulties[0].timingPoints).toFixed(2) })}</div>
                    </>
                )}
                <div className="border-t border-[#2a2a2a] pt-2 mt-2">
                    <div className="text-[#e0e0e0] mb-1">{t("preview.debug.recentHits")}</div>
                    {debugInfo.length === 0 ? (
                        <div className="opacity-50">{t("preview.debug.noHits")}</div>
                    ) : (
                        debugInfo.map((info, i) => (
                            <div key={i} className="opacity-80">{info}</div>
                        ))
                    )}
                </div>

                {beatmapData && (
                    <div className="border-t border-[#2a2a2a] pt-2 mt-2">
                        <div className="text-[#e0e0e0] mb-1">{t("preview.debug.nextNotes")}</div>
                        {filteredDifficulties
                            .flatMap(diff =>
                                diff.hitObjects
                                    .filter(obj => obj.time > currentTime && obj.time < currentTime + 3000)
                                    .slice(0, 3)
                                    .map(obj => ({
                                        diff: diff.version,
                                        time: obj.time,
                                        type: obj.type,
                                        endTime: obj.endTime,
                                        timeUntil: obj.time - currentTime
                                    }))
                            )
                            .sort((a, b) => a.time - b.time)
                            .slice(0, 5)
                            .map((note, i) => (
                                <div key={i} className="opacity-80">
                                    {t("preview.debug.nextNote", {
                                        diff: note.diff,
                                        type: note.type,
                                        ms: note.timeUntil.toFixed(0),
                                    })}
                                    {note.endTime && ` (${note.time}-${note.endTime}, dur: ${note.endTime - note.time}ms)`}
                                </div>
                            ))
                        }
                    </div>
                )}
            </div>
        </div>
    );
}
