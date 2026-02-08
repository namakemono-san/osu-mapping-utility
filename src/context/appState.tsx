import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type AppStateValue = {
  songsFolder: string | null;
  setSongsFolder: (path: string | null) => void;
};

const AppStateContext = createContext<AppStateValue>({
  songsFolder: null,
  setSongsFolder: () => {},
});

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [songsFolder, setSongsFolderState] = useState<string | null>(() => {
    try {
      const v = localStorage.getItem("songsFolder");
      return v && v.trim().length > 0 ? v : null;
    } catch {
      return null;
    }
  });

  const setSongsFolder = useCallback((path: string | null) => {
    const next = path && path.trim().length > 0 ? path : null;
    setSongsFolderState(next);
    try {
      if (next) localStorage.setItem("songsFolder", next);
      else localStorage.removeItem("songsFolder");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "songsFolder") return;
      const v = e.newValue;
      setSongsFolderState(v && v.trim().length > 0 ? v : null);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo(() => ({ songsFolder, setSongsFolder }), [songsFolder, setSongsFolder]);
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  return useContext(AppStateContext);
}
