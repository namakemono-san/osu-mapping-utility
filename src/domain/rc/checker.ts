import type { CheckResult } from "./types";
import type { OsuBeatmapset } from "../osu/types";
import { allChecks } from "./checks";

export function runAllChecks(data: OsuBeatmapset): CheckResult[] {
    const results: CheckResult[] = [];

    for (const check of allChecks) {
        try {
            results.push(...check.run(data));
        } catch (e) {
            results.push({
                checkId: check.id,
                messageKey: "rc.error.checkFailed",
                messageParams: { checkId: check.id, error: String(e) },
                severity: "warning",
                category: check.category,
                passed: false,
            });
        }
    }

    return results;
}
