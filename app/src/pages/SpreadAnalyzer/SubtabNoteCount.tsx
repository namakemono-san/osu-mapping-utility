import type { SpreadDiffResult } from "./spreadLogic";
import { useI18n } from "../../hooks/i18nContext";

const INNER_CATS = new Set(["Inner Oni", "Ura Oni", "Hell Oni"]);

type Transition =
    | "kantan-futsuu"
    | "futsuu-muzukashii"
    | "muzukashii-oni"
    | "oni-inner"
    | "inner-inner";

function getTransition(from: string, to: string): Transition | null {
    if (from === "Kantan" && to === "Futsuu") return "kantan-futsuu";
    if (from === "Futsuu" && to === "Muzukashii") return "futsuu-muzukashii";
    if (from === "Muzukashii" && to === "Oni") return "muzukashii-oni";
    if (from === "Oni" && INNER_CATS.has(to)) return "oni-inner";
    if (INNER_CATS.has(from) && INNER_CATS.has(to)) return "inner-inner";
    return null;
}

interface RatioRule {
    okMin: number;
    okMax: number;
    warnMin: number;
    warnMax: number;
}

const RATIO_RULES: Record<Transition, RatioRule> = {
    "kantan-futsuu":       { okMin: 1.60, okMax: 2.15, warnMin: 1.55, warnMax: 2.30 },
    "futsuu-muzukashii":   { okMin: 1.27, okMax: 1.58, warnMin: 1.20, warnMax: 1.65 },
    "muzukashii-oni":      { okMin: 1.17, okMax: 1.48, warnMin: 1.13, warnMax: 1.55 },
    "oni-inner":           { okMin: 1.10, okMax: 1.45, warnMin: 1.00, warnMax: 1.55 },
    "inner-inner":         { okMin: 1.02, okMax: 1.32, warnMin: 1.00, warnMax: 1.50 },
};

function evalStatus(ratio: number, rule: RatioRule): "ok" | "warning" | "error" {
    if (ratio >= rule.okMin && ratio <= rule.okMax) return "ok";
    if (ratio >= rule.warnMin && ratio <= rule.warnMax) return "warning";
    return "error";
}

interface NoteCountRowProps {
    r: SpreadDiffResult;
    prev: SpreadDiffResult | null;
}

function NoteCountRow({ r, prev }: NoteCountRowProps) {
    const { t } = useI18n();
    const delta = prev !== null ? r.noteCount - prev.noteCount : null;
    const ratio = prev !== null && prev.noteCount > 0 ? r.noteCount / prev.noteCount : null;
    const transition = prev !== null ? getTransition(prev.category, r.category) : null;
    const rule = transition ? RATIO_RULES[transition] : null;
    const status = ratio !== null && rule !== null ? evalStatus(ratio, rule) : null;

    const statusClass =
        status === "ok"      ? "text-green-400"  :
        status === "warning" ? "text-yellow-400" :
        status === "error"   ? "text-red-400"    :
        "text-text-muted";

    const statusLabel =
        status === "ok"      ? t("spread.status.ok")      :
        status === "warning" ? t("spread.status.warning") :
        status === "error"   ? t("spread.status.error")   :
        t("spread.status.na");

    return (
        <tr className="border-b border-border-muted/40">
            <td className="py-2 pr-4 font-medium text-text-primary max-w-[120px] truncate">{r.version}</td>
            <td className="py-2 pr-4 text-text-secondary">{r.category}</td>
            <td className="py-2 pr-4 text-text-primary tabular-nums">{r.noteCount.toLocaleString()}</td>
            <td className="py-2 pr-4 text-text-muted tabular-nums">
                {delta !== null ? (delta >= 0 ? `+${delta}` : `${delta}`) : "—"}
            </td>
            <td className="py-2 pr-4 text-text-secondary tabular-nums">
                {ratio !== null ? `×${ratio.toFixed(2)}` : "—"}
            </td>
            <td className={`py-2 font-medium ${statusClass}`}>{statusLabel}</td>
        </tr>
    );
}

interface Props {
    results: SpreadDiffResult[];
}

export function SubtabNoteCount({ results }: Props) {
    const { t } = useI18n();

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-text-muted border-b border-border-muted text-left">
                        <th className="pb-2 pr-4 font-medium">Diff</th>
                        <th className="pb-2 pr-4 font-medium">Category</th>
                        <th className="pb-2 pr-4 font-medium">Notes</th>
                        <th className="pb-2 pr-4 font-medium">Δ prev</th>
                        <th className="pb-2 pr-4 font-medium">{t("spread.noteCount.ratio")}</th>
                        <th className="pb-2 font-medium">{t("spread.noteCount.status")}</th>
                    </tr>
                </thead>
                <tbody>
                    {results.map((r, i) => (
                        <NoteCountRow key={r.version} r={r} prev={i > 0 ? results[i - 1] : null} />
                    ))}
                </tbody>
            </table>
        </div>
    );
}
