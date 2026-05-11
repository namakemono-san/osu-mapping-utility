import { useMemo } from "react";
import type { SpreadDiffResult, FinisherGroup } from "./spreadLogic";
import { computeFinisherGroups } from "./spreadLogic";
import { useI18n } from "../../hooks/i18nContext";
import { TimestampLink } from "./TimestampLink";

interface TableProps {
    groups: FinisherGroup[];
    results: SpreadDiffResult[];
}

function FinisherTable({ groups, results }: TableProps) {
    return (
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
                    {groups.map(g => (
                        <tr key={g.time} className="border-b border-border-muted/40">
                            <td className="py-1.5 pr-6 text-xs">
                                <TimestampLink ms={g.time} />
                            </td>
                            {g.byDiff.map((note, i) => (
                                <td
                                    key={i}
                                    className={`py-1.5 pr-4 font-bold ${
                                        note === null ? "text-text-muted" :
                                        note.kind === "D" ? "text-red-400" : "text-blue-400"
                                    }`}
                                >
                                    {note === null ? "—" : note.kind}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

interface Props {
    results: SpreadDiffResult[];
}

export function SubtabFinishers({ results }: Props) {
    const { t } = useI18n();
    const groups = useMemo(() => computeFinisherGroups(results), [results]);

    if (groups.length === 0) {
        return <p className="text-text-muted text-sm py-4">{t("spread.finishers.none")}</p>;
    }

    const missing = groups.filter(g => g.status === "missing");
    const mismatch = groups.filter(g => g.status === "mismatch");
    const matched = groups.filter(g => g.status === "matched");

    return (
        <div className="space-y-6">
            {missing.length > 0 && (
                <section>
                    <h3 className="text-sm font-semibold text-yellow-400 mb-2">
                        {t("spread.finishers.missing")} ({missing.length})
                    </h3>
                    <FinisherTable groups={missing} results={results} />
                </section>
            )}
            {mismatch.length > 0 && (
                <section>
                    <h3 className="text-sm font-semibold text-red-400 mb-2">
                        {t("spread.finishers.mismatch")} ({mismatch.length})
                    </h3>
                    <FinisherTable groups={mismatch} results={results} />
                </section>
            )}
            {matched.length > 0 && (
                <section>
                    <h3 className="text-sm font-semibold text-green-400 mb-2">
                        {t("spread.finishers.matched")} ({matched.length})
                    </h3>
                    <FinisherTable groups={matched} results={results} />
                </section>
            )}
        </div>
    );
}
