import { useState } from "react";
import { MdCheck, MdClose, MdWarning, MdInfo, MdExpandMore, MdExpandLess } from "react-icons/md";
import type { CheckResult, IssueLevel } from "../../domain/rc/types";
import { useI18n } from "../../hooks/i18nContext";
import type { LocaleKey } from "../../locale";

interface CheckResultRowProps {
    result: CheckResult;
}

function levelIcon(level: IssueLevel) {
    switch (level) {
        case "Problem": return <MdClose className="text-red-400 shrink-0" />;
        case "Warning": return <MdWarning className="text-yellow-400 shrink-0" />;
        case "Minor":   return <MdWarning className="text-orange-400 shrink-0" />;
        case "Check":   return <MdInfo className="text-blue-400 shrink-0" />;
        case "Info":    return <MdInfo className="text-text-muted shrink-0" />;
    }
}

const LEVEL_ORDER: IssueLevel[] = ["Problem", "Warning", "Minor", "Check", "Info"];

export function CheckResultRow({ result }: CheckResultRowProps) {
    const [expanded, setExpanded] = useState(false);
    const { t } = useI18n();

    const hasIssues = result.issues.length > 0;
    const effectivePassed = !hasIssues;

    const topLevelIssue = result.issues.reduce<IssueLevel | null>((worst, issue) => {
        if (worst === null) return issue.level;
        return LEVEL_ORDER.indexOf(issue.level) < LEVEL_ORDER.indexOf(worst) ? issue.level : worst;
    }, null);

    const rowIcon = effectivePassed
        ? <MdCheck className="text-green-400 text-lg shrink-0" />
        : topLevelIssue === "Problem"
            ? <MdClose className="text-red-400 text-lg shrink-0" />
            : topLevelIssue === "Warning"
                ? <MdWarning className="text-yellow-400 text-lg shrink-0" />
                : topLevelIssue === "Minor"
                    ? <MdWarning className="text-orange-400 text-lg shrink-0" />
                    : <MdInfo className="text-blue-400 text-lg shrink-0" />;

    const statusColor = effectivePassed
        ? "text-green-400 border-green-400/30"
        : topLevelIssue === "Problem"
            ? "text-red-400 border-red-400/30"
            : topLevelIssue === "Warning"
                ? "text-yellow-400 border-yellow-400/30"
                : topLevelIssue === "Minor"
                    ? "text-orange-400 border-orange-400/30"
                    : "text-blue-400 border-blue-400/30";

    const statusLabel = effectivePassed
        ? t("rc.level.ok")
        : topLevelIssue
            ? t(`rc.level.${topLevelIssue}` as LocaleKey)
            : t("rc.level.issue");

    const displayMessage = t(`rc.check.${result.checkId}` as LocaleKey) || result.message;

    return (
        <div className={effectivePassed ? "opacity-60" : ""}>
            <div className="flex items-start gap-3 px-3 py-2">
                {rowIcon}
                <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary">{displayMessage}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded border ${statusColor}`}>
                        {statusLabel}
                    </span>
                    {hasIssues && (
                        <button
                            onClick={() => setExpanded(v => !v)}
                            className="text-text-muted hover:text-text-primary"
                        >
                            {expanded
                                ? <MdExpandLess className="text-lg" />
                                : <MdExpandMore className="text-lg" />
                            }
                        </button>
                    )}
                </div>
            </div>
            {expanded && hasIssues && (
                <div className="ml-10 mb-2 space-y-1">
                    {result.issues.map((issue, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                            {levelIcon(issue.level)}
                            <span className="tabular-nums">{issue.formattedMessage}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
