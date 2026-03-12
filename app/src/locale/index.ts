import { en, type LocaleKey } from "./en";
import { ja } from "./ja";

export type Lang = "en" | "ja";

const DICTS: Record<Lang, Record<LocaleKey, string>> = {
    en,
    ja,
};

export function detectDefaultLang(): Lang {
    const nav = typeof navigator !== "undefined" ? navigator.language : "en";
    return nav.toLowerCase().startsWith("ja") ? "ja" : "en";
}

export function getLocaleForLang(lang: Lang): string {
    return lang === "ja" ? "ja-JP" : "en-US";
}

export function t(lang: Lang, key: LocaleKey, params?: Record<string, string | number>): string {
    const template = DICTS[lang][key] ?? en[key];
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (m, k) => {
        const v = params[k];
        return v === undefined ? m : String(v);
    });
}

export type { LocaleKey };
