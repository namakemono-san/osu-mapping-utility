import { useMemo, useState } from "react";
import type { SpreadDiffResult } from "./spreadLogic";
import { computeDensityInversions } from "./spreadLogic";
import { useI18n } from "../../hooks/i18nContext";
import { TimestampLink } from "./TimestampLink";

interface Props {
    results: SpreadDiffResult[];
}

export function SubtabDensity({ results }: Props) {
    const { t } = useI18n();
    const [minGap, setMinGap] = useState(1);

    const inversions = useMemo(
        () => computeDensityInversions(results, minGap),
        [results, minGap]
    );

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <label className="text-sm text-text-secondary">{t("spread.density.minDiff")}</label>
                <select
                    value={minGap}
                    onChange={e => setMinGap(Number(e.target.value))}
                    className="text-sm bg-surface-base border border-border-muted rounded px-2 py-1 text-text-primary"
                >
                    <option value={1}>+1</option>
                    <option value={2}>+2</option>
                    <option value={3}>+3</option>
                </select>
            </div>

            {inversions.length === 0 ? (
                <p className="text-text-muted text-sm py-4">{t("spread.density.noIssues")}</p>
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
                            {inversions.map(inv => (
                                <tr key={inv.measureStart} className="border-b border-border-muted/40">
                                    <td className="py-1.5 pr-6 text-xs">
                                        <TimestampLink ms={inv.measureStart} />
                                    </td>
                                    {inv.noteCounts.map((count, i) => {
                                        const isInverted =
                                            i + minGap < inv.noteCounts.length &&
                                            count > inv.noteCounts[i + minGap];
                                        return (
                                            <td
                                                key={i}
                                                className={`py-1.5 pr-4 tabular-nums ${
                                                    isInverted ? "text-yellow-400 font-medium" : "text-text-secondary"
                                                }`}
                                            >
                                                {count}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
