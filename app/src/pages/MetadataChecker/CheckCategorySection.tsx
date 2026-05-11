import { useState } from "react";
import { MdExpandMore, MdExpandLess } from "react-icons/md";
import type { CheckResult } from "../../domain/rc/types";
import { CheckResultRow } from "./CheckResultRow";
import { useI18n } from "../../hooks/i18nContext";
import type { LocaleKey } from "../../locale";

interface CheckCategorySectionProps {
    category: string;
    results: CheckResult[];
}

export function CheckCategorySection({ category, results }: CheckCategorySectionProps) {
    const [expanded, setExpanded] = useState(true);
    const { t } = useI18n();

    const failCount = results.filter(r => r.issues.length > 0).length;
    const categoryKey = `rc.category.${category}` as LocaleKey;
    const categoryLabel = t(categoryKey);

    return (
        <div className="rounded-lg bg-surface-base-soft border border-border-muted overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors"
            >
                <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-text-primary">{categoryLabel}</h3>
                    <span className="text-xs text-text-muted">
                        {t("rc.section.checksCount", {
                            count: results.length,
                            plural: results.length === 1 ? "" : "s",
                        })}
                    </span>
                    {failCount > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
                            {t("rc.section.failedCount", { count: failCount })}
                        </span>
                    )}
                </div>
                {expanded
                    ? <MdExpandLess className="text-xl text-text-muted" />
                    : <MdExpandMore className="text-xl text-text-muted" />
                }
            </button>
            {expanded && (
                <div className="border-t border-border-muted divide-y divide-border-muted/50">
                    {results.map((r, i) => (
                        <CheckResultRow key={`${r.checkId}-${r.beatmapVersion ?? ""}-${i}`} result={r} />
                    ))}
                </div>
            )}
        </div>
    );
}
