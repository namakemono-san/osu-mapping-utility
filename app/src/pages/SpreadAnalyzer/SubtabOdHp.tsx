import type { SpreadDiffResult } from "./spreadLogic";
import { useI18n } from "../../hooks/i18nContext";

interface OdHpRule {
    odMin?: number;
    odMax?: number;
    hpMin?: number;
    hpMax?: number;
}

const CATEGORY_RULES: Record<string, OdHpRule | null> = {
    "Kantan": { odMax: 3, hpMin: 8 },
    "Futsuu": { odMax: 4, hpMin: 7 },
    "Muzukashii": { odMax: 5, hpMin: 6 },
    "Oni": { odMin: 5, hpMin: 5 },
    "Inner Oni": { odMin: 6, hpMin: 5 },
    "Ura Oni": { odMin: 6, hpMin: 5 },
    "Hell Oni": { odMin: 6, hpMin: 5 },
    "Custom": null,
};

function ruleLabel(rule: OdHpRule | null): string {
    if (!rule) return "—";
    const parts: string[] = [];
    if (rule.odMax !== undefined) parts.push(`OD ≤ ${rule.odMax}`);
    if (rule.odMin !== undefined) parts.push(`OD ≥ ${rule.odMin}`);
    if (rule.hpMin !== undefined) parts.push(`HP ≥ ${rule.hpMin}`);
    if (rule.hpMax !== undefined) parts.push(`HP ≤ ${rule.hpMax}`);
    return parts.join(", ");
}

interface Props {
    results: SpreadDiffResult[];
}

export function SubtabOdHp({ results }: Props) {
    const { t } = useI18n();

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-text-muted border-b border-border-muted text-left">
                        <th className="pb-2 pr-4 font-medium">Diff</th>
                        <th className="pb-2 pr-4 font-medium">Category</th>
                        <th className="pb-2 pr-4 font-medium">OD</th>
                        <th className="pb-2 pr-4 font-medium">ΔOD</th>
                        <th className="pb-2 pr-4 font-medium">HP</th>
                        <th className="pb-2 pr-4 font-medium">ΔHP</th>
                        <th className="pb-2 pr-4 font-medium">{t("spread.odhp.rule")}</th>
                        <th className="pb-2 font-medium">{t("spread.odhp.status")}</th>
                    </tr>
                </thead>
                <tbody>
                    {results.map((r, i) => {
                        const prev = i > 0 ? results[i - 1] : null;
                        const rule = CATEGORY_RULES[r.category] ?? null;

                        const odViolation = rule !== null && (
                            (rule.odMax !== undefined && r.od > rule.odMax) ||
                            (rule.odMin !== undefined && r.od < rule.odMin)
                        );
                        const hpViolation = rule !== null && (
                            (rule.hpMin !== undefined && r.hp < rule.hpMin) ||
                            (rule.hpMax !== undefined && r.hp > rule.hpMax)
                        );

                        const odDelta = prev !== null ? r.od - prev.od : null;
                        const hpDelta = prev !== null ? r.hp - prev.hp : null;
                        const odDeltaWarn = odDelta !== null && odDelta < 0;
                        const hpDeltaWarn = hpDelta !== null && hpDelta > 0;

                        const hasWarning = odViolation || hpViolation || odDeltaWarn || hpDeltaWarn;

                        return (
                            <tr key={r.version} className="border-b border-border-muted/40">
                                <td className="py-2 pr-4 font-medium text-text-primary max-w-[120px] truncate">{r.version}</td>
                                <td className="py-2 pr-4 text-text-secondary">{r.category}</td>
                                <td className={`py-2 pr-4 ${odViolation ? "text-red-400 font-medium" : "text-text-primary"}`}>
                                    {r.od}
                                </td>
                                <td className={`py-2 pr-4 ${odDeltaWarn ? "text-yellow-400" : "text-text-muted"}`}>
                                    {odDelta !== null ? (odDelta >= 0 ? `+${odDelta.toFixed(1)}` : odDelta.toFixed(1)) : "—"}
                                </td>
                                <td className={`py-2 pr-4 ${hpViolation ? "text-red-400 font-medium" : "text-text-primary"}`}>
                                    {r.hp}
                                </td>
                                <td className={`py-2 pr-4 ${hpDeltaWarn ? "text-yellow-400" : "text-text-muted"}`}>
                                    {hpDelta !== null ? (hpDelta >= 0 ? `+${hpDelta.toFixed(1)}` : hpDelta.toFixed(1)) : "—"}
                                </td>
                                <td className="py-2 pr-4 text-text-muted text-xs whitespace-nowrap">{ruleLabel(rule)}</td>
                                <td className={`py-2 font-medium ${hasWarning ? "text-yellow-400" : "text-green-400"}`}>
                                    {hasWarning ? t("spread.status.warning") : t("spread.status.ok")}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
