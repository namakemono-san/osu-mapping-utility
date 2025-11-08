import { createContext, useContext, useState } from "react";

type Lang = "en" | "ja";
const I18nContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
    lang: "en",
    setLang: () => { },
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
    const [lang, setLang] = useState<Lang>(
        (localStorage.getItem("lang") as Lang) || "en"
    );
    return (
        <I18nContext.Provider value={{ lang, setLang }}>
            {children}
        </I18nContext.Provider>
    );
}

export function useI18n() {
    return useContext(I18nContext);
}
