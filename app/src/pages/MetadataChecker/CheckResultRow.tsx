import { MdCheck, MdClose, MdWarning } from "react-icons/md";
import type { CheckResult } from "../../domain/rc/types";
import { useI18n } from "../../hooks/i18nContext";
import type { LocaleKey } from "../../locale";

interface CheckResultRowProps {
    result: CheckResult;
}

export function CheckResultRow({ result }: CheckResultRowProps) {
    const { t } = useI18n();

    const icon = result.passed
        ? <MdCheck className="text-green-400 text-lg shrink-0" />
        : result.severity === "rule"
            ? <MdClose className="text-red-400 text-lg shrink-0" />
            : result.severity === "guideline"
                ? <MdWarning className="text-yellow-400 text-lg shrink-0" />
                : <MdWarning className="text-orange-400 text-lg shrink-0" />;

    const severityLabel = result.passed
        ? t("rc.severity.ok")
        : result.severity === "rule"
            ? t("rc.severity.problem")
            : t("rc.severity.warning");

    const severityColor = result.passed
        ? "text-green-400 border-green-400/30"
        : result.severity === "rule"
            ? "text-red-400 border-red-400/30"
            : "text-yellow-400 border-yellow-400/30";

    const diffLabel = result.difficultyNames
        ? result.difficultyNames.join(", ")
        : result.difficultyName
            ? result.difficultyName
            : null;

    return (
        <div className={`flex items-start gap-3 px-3 py-2 rounded-md ${result.passed ? "opacity-60" : ""}`}>
            {icon}
            <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary">
                    {t(result.messageKey as LocaleKey, result.messageParams)}
                </p>
                {diffLabel && (
                    <span className="text-xs text-text-muted">
                        [{!result.difficultyName && !result.difficultyNames ? t("rc.allDifficulties") : diffLabel}]
                    </span>
                )}
            </div>
            <span className={`text-xs px-2 py-0.5 rounded border shrink-0 ${severityColor}`}>
                {severityLabel}
            </span>
        </div>
    );
}
