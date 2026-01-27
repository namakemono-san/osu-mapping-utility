import { createContext, useContext, useMemo, useState } from "react";
import { detectDefaultLang, getLocaleForLang, t as translate, type Lang, type LocaleKey } from "../locale";

type I18nContextValue = {
    lang: Lang;
    locale: string;
    setLang: (l: Lang) => void;
    t: (key: LocaleKey, params?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue>({
    lang: "en",
    locale: "en-US",
    setLang: () => { },
    t: (key) => key,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
    const [lang, setLangState] = useState<Lang>(() => {
        const stored = localStorage.getItem("lang") as Lang | null;
        return stored === "en" || stored === "ja" ? stored : detectDefaultLang();
    });

    const setLang = (l: Lang) => {
        setLangState(l);
        localStorage.setItem("lang", l);
    };

    const locale = useMemo(() => getLocaleForLang(lang), [lang]);
    const t = useMemo(() => {
        return (key: LocaleKey, params?: Record<string, string | number>) => translate(lang, key, params);
    }, [lang]);

    return (
        <I18nContext.Provider value={{ lang, locale, setLang, t }}>
            {children}
        </I18nContext.Provider>
    );
}

export function useI18n() {
    return useContext(I18nContext);
}
