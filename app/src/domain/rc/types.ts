export type IssueLevel = "Problem" | "Warning" | "Minor" | "Check" | "Info";
type CheckScope = "general" | "set" | "beatmap";

export interface IssueResult {
    level: IssueLevel;
    formattedMessage: string;
    beatmapVersion: string | null;
}

export interface CheckResult {
    checkId: string;
    category: string;
    message: string;
    scope: CheckScope;
    beatmapVersion: string | null;
    passed: boolean;
    issues: IssueResult[];
}

export interface RcCheckResponse {
    checks: CheckResult[];
}
