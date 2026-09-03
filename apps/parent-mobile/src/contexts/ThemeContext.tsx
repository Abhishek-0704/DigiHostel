import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { buildTheme, type Theme, type ThemeMode } from "../styles/tokens";
import { secureStorage } from "../services/storage/secureStorage";
import { STORAGE_KEYS } from "../constants/storageKeys";

export type ThemePreference = ThemeMode | "system";

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/** Theme preference persistence uses secureStorage (expo-secure-store) —
 * not because a theme choice is sensitive, but to avoid adding a second
 * storage dependency (e.g. AsyncStorage) for one small non-secret string
 * when a working secure-storage abstraction already exists in this
 * foundation. Revisit if a lighter-weight general-purpose storage need
 * emerges later. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    let cancelled = false;
    secureStorage.getItem(STORAGE_KEYS.themePreference).then((stored) => {
      if (!cancelled && (stored === "light" || stored === "dark" || stored === "system")) {
        setPreferenceState(stored);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    void secureStorage.setItem(STORAGE_KEYS.themePreference, next);
  };

  const resolvedMode: ThemeMode =
    preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: buildTheme(resolvedMode), preference, setPreference }),
    [resolvedMode, preference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeContext must be used within a ThemeProvider");
  return ctx;
}
