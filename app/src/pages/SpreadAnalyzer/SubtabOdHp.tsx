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

function isOdViolation(rule: OdHpRule | null, od: number): boolean {
    if (!rule) return false;
    if (rule.odMax !== undefined && od > rule.odMax) return true;
    if (rule.odMin !== undefined && od < rule.odMin) return true;
    return false;
}

function isHpViolation(rule: OdHpRule | null, hp: number): boolean {
    if (!rule) return false;
    if (rule.hpMin !== undefined && hp < rule.hpMin) return true;
    if (rule.hpMax !== undefined && hp > rule.hpMax) return true;
    return false;
}

function formatDelta(delta: number | null): string {
    if (delta === null) return "—";
    return delta >= 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1);
}

function ruleLabel(rule: OdHpRule | null): string {
    if (!rule) return "—";
    const parts: string[] = [];
    if (rule.odMax !== undefined) parts.push(`OD ≤ ${rule.odMax}`);
    if (rule.odMin !== undefined) parts.push(`OD ≥ ${rule.odMin}`);
    if (rule.hpMin !== undefined) parts.push(`HP ≥ ${rule.hpMin}`);
    if (rule.hpMax !== undefined) parts.push(`HP ≤ ${rule.hpMax}`);
    return parts.join(", ");
}

interface OdHpRowProps {
    r: SpreadDiffResult;
    prev: SpreadDiffResult | null;
}

function OdHpRow({ r, prev }: OdHpRowProps) {
    const { t } = useI18n();
    const rule = CATEGORY_RULES[r.category] ?? null;
    const odViolation = isOdViolation(rule, r.od);
    const hpViolation = isHpViolation(rule, r.hp);
    const odDelta = prev !== null ? r.od - prev.od : null;
    const hpDelta = prev !== null ? r.hp - prev.hp : null;
    const odDeltaWarn = odDelta !== null && odDelta < 0;
    const hpDeltaWarn = hpDelta !== null && hpDelta > 0;
    const hasWarning = odViolation || hpViolation || odDeltaWarn || hpDeltaWarn;

    return (
        <tr className="border-b border-border-muted/40">
            <td className="py-2 pr-4 font-medium text-text-primary max-w-[120px] truncate">{r.version}</td>
            <td className="py-2 pr-4 text-text-secondary">{r.category}</td>
            <td className={`py-2 pr-4 ${odViolation ? "text-red-400 font-medium" : "text-text-primary"}`}>{r.od}</td>
            <td className={`py-2 pr-4 ${odDeltaWarn ? "text-yellow-400" : "text-text-muted"}`}>{formatDelta(odDelta)}</td>
            <td className={`py-2 pr-4 ${hpViolation ? "text-red-400 font-medium" : "text-text-primary"}`}>{r.hp}</td>
            <td className={`py-2 pr-4 ${hpDeltaWarn ? "text-yellow-400" : "text-text-muted"}`}>{formatDelta(hpDelta)}</td>
            <td className="py-2 pr-4 text-text-muted text-xs whitespace-nowrap">{ruleLabel(rule)}</td>
            <td className={`py-2 font-medium ${hasWarning ? "text-yellow-400" : "text-green-400"}`}>
                {hasWarning ? t("spread.status.warning") : t("spread.status.ok")}
            </td>
        </tr>
    );
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
                    {results.map((r, i) => (
                        <OdHpRow key={r.version} r={r} prev={i > 0 ? results[i - 1] : null} />
                    ))}
                </tbody>
            </table>
        </div>
    );
}
