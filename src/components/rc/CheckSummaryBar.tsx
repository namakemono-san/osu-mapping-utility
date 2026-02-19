import { MdCheck, MdClose, MdWarning } from "react-icons/md";
import type { CheckResult } from "../../domain/rc/types";
import { useI18n } from "../../hooks/i18nContext";

interface CheckSummaryBarProps {
    results: CheckResult[];
    asyncChecking?: boolean;
}

export function CheckSummaryBar({ results, asyncChecking }: CheckSummaryBarProps) {
    const { t } = useI18n();

    const passed = results.filter(r => r.passed).length;
    const problems = results.filter(r => !r.passed && r.severity === "rule").length;
    const warnings = results.filter(r => !r.passed && (r.severity === "guideline" || r.severity === "warning")).length;

    return (
        <div className="rounded-lg bg-surface-base-soft border border-border-muted overflow-hidden">
            <div className="flex flex-wrap items-center gap-4 px-4 py-3">
                <div className="flex items-center gap-1.5 text-green-400">
                    <MdCheck className="text-lg" />
                    <span className="text-sm font-medium">
                        {t("rc.summary.ok", { count: passed })}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 text-red-400">
                    <MdClose className="text-lg" />
                    <span className="text-sm font-medium">
                        {t("rc.summary.problems", { count: problems, plural: problems === 1 ? "" : "s" })}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 text-yellow-400">
                    <MdWarning className="text-lg" />
                    <span className="text-sm font-medium">
                        {t("rc.summary.warnings", { count: warnings, plural: warnings === 1 ? "" : "s" })}
                    </span>
                </div>
                {asyncChecking && (
                    <span className="text-xs text-text-muted animate-pulse ml-auto">
                        {t("rc.summary.analyzing")}
                    </span>
                )}
            </div>
            {asyncChecking && (
                <div className="h-0.5 bg-border-muted relative overflow-hidden">
                    <div
                        className="absolute inset-y-0 w-1/3 bg-blue-400/60 rounded-full"
                        style={{ animation: "indeterminate 1.4s ease-in-out infinite" }}
                    />
                    <style>{`
                        @keyframes indeterminate {
                            0% { left: -33%; }
                            100% { left: 100%; }
                        }
                    `}</style>
                </div>
            )}
        </div>
    );
}
