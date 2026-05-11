import { useMemo } from "react";
import type { SpreadDiffResult } from "./spreadLogic";
import { computeProgressionIssues, computeConsistencyIssues } from "./spreadLogic";
import { useI18n } from "../../hooks/i18nContext";
import { TimestampLink } from "./TimestampLink";

function fmt(n: number, decimals = 0): string {
    return n.toFixed(decimals);
}

interface Props {
    results: SpreadDiffResult[];
}

export function SubtabScrollSpeed({ results }: Props) {
    const { t } = useI18n();
    const progressionIssues = useMemo(() => computeProgressionIssues(results), [results]);
    const consistencyIssues = useMemo(() => computeConsistencyIssues(results), [results]);

    const diffsWithRapid = results.filter(r => r.scrollSpeed.rapidChanges.length > 0);

    return (
        <div className="space-y-6">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-text-muted border-b border-border-muted text-left">
                            <th className="pb-2 pr-4 font-medium">Diff</th>
                            <th className="pb-2 pr-4 font-medium">Category</th>
                            <th className="pb-2 pr-4 font-medium">Min px/s</th>
                            <th className="pb-2 pr-4 font-medium">Max px/s</th>
                            <th className="pb-2 pr-4 font-medium">Δ</th>
                            <th className="pb-2 pr-4 font-medium">Ratio</th>
                            <th className="pb-2 font-medium">SV range</th>
                        </tr>
                    </thead>
                    <tbody>
                        {results.map(r => {
                            const s = r.scrollSpeed.summary;
                            return (
                                <tr key={r.version} className="border-b border-border-muted/40">
                                    <td className="py-2 pr-4 font-medium text-text-primary max-w-[120px] truncate">
                                        {r.version}
                                    </td>
                                    <td className="py-2 pr-4 text-text-secondary">{r.category}</td>
                                    <td className="py-2 pr-4 text-text-primary tabular-nums">
                                        {s ? fmt(s.minSpeed) : "—"}
                                    </td>
                                    <td className="py-2 pr-4 text-text-primary tabular-nums">
                                        {s ? fmt(s.maxSpeed) : "—"}
                                    </td>
                                    <td className="py-2 pr-4 text-text-secondary tabular-nums">
                                        {s ? fmt(s.deltaSpeed) : "—"}
                                    </td>
                                    <td className="py-2 pr-4 text-text-secondary tabular-nums">
                                        {s ? `×${s.ratio.toFixed(2)}` : "—"}
                                    </td>
                                    <td className="py-2 text-text-muted text-xs tabular-nums">
                                        {s ? `${s.minSv.toFixed(2)}–${s.maxSv.toFixed(2)}` : "—"}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <section>
                <h3 className="text-sm font-semibold text-text-secondary mb-2">
                    {t("spread.scroll.rapidChanges")}
                </h3>
                {diffsWithRapid.length === 0 ? (
                    <p className="text-text-muted text-sm">{t("spread.scroll.noRapid")}</p>
                ) : (
                    <div className="space-y-3">
                        {diffsWithRapid.map(r => (
                            <div key={r.version}>
                                <div className="text-xs font-medium text-text-secondary mb-1">
                                    {r.version} ({r.category})
                                </div>
                                <div className="space-y-1">
                                    {r.scrollSpeed.rapidChanges.map((rc, i) => (
                                        <div key={i} className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                                            <TimestampLink ms={rc.time}  />
                                            <span className="text-text-muted">
                                                {fmt(rc.fromSpeed)} → {fmt(rc.toSpeed)} px/s
                                            </span>
                                            <span className="text-text-muted">Δ{fmt(rc.delta)}</span>
                                            <span className="text-text-muted">×{rc.ratio.toFixed(2)}</span>
                                            <span className="text-text-muted">gap {rc.gapMs}ms</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section>
                <h3 className="text-sm font-semibold text-text-secondary mb-2">
                    {t("spread.scroll.progression")}
                </h3>
                {progressionIssues.length === 0 ? (
                    <p className="text-text-muted text-sm">{t("spread.scroll.noProgression")}</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-text-muted border-b border-border-muted text-left">
                                    <th className="pb-2 pr-6 font-medium">Time</th>
                                    {results.map(r => (
                                        <th key={r.version} className="pb-2 pr-4 font-medium max-w-[80px] truncate">
                                            {r.version}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {progressionIssues.map(issue => (
                                    <tr key={issue.time} className="border-b border-border-muted/40">
                                        <td className="py-1.5 pr-6 text-xs">
                                            <TimestampLink ms={issue.time}  />
                                        </td>
                                        {issue.speeds.map((speed, i) => {
                                            const isReversed =
                                                i > 0 && speed < issue.speeds[i - 1] - 10;
                                            return (
                                                <td
                                                    key={i}
                                                    className={`py-1.5 pr-4 text-xs tabular-nums ${
                                                        isReversed ? "text-red-400 font-medium" : "text-text-secondary"
                                                    }`}
                                                >
                                                    {fmt(speed)}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section>
                <h3 className="text-sm font-semibold text-text-secondary mb-2">
                    {t("spread.scroll.consistency")}
                </h3>
                {consistencyIssues.length === 0 ? (
                    <p className="text-text-muted text-sm">{t("spread.scroll.noConsistency")}</p>
                ) : (
                    <div className="space-y-1.5">
                        {consistencyIssues.map((issue, i) => (
                            <div key={i} className="flex flex-wrap gap-x-4 text-xs">
                                <TimestampLink ms={issue.time}  />
                                <span className="text-text-secondary">
                                    {issue.versionA} → {issue.versionB}
                                </span>
                                <span className="text-text-muted">
                                    Δ{fmt(issue.deltaA)} vs Δ{fmt(issue.deltaB)}
                                </span>
                                <span className={issue.reason === "opposite" ? "text-red-400" : "text-yellow-400"}>
                                    {issue.reason}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
