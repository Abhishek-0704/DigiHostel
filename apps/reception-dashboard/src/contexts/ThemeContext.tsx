import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { buildTheme, type Theme, type ThemeMode } from "../styles/tokens";

/**
 * Theme foundation (Prompt 0.2 §17 — "future dark mode compatibility where
 * supported"). Defaults to the browser's `prefers-color-scheme` (matching
 * global.css's own `@media (prefers-color-scheme: dark)` block) with no
 * manual override UI yet — that belongs to a future Settings page
 * (src/pages/SettingsPage.tsx is a placeholder today).
 */
interface ThemeContextValue {
  theme: Theme;
  setMode: (mode: ThemeMode) => void;
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
  );
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => (systemPrefersDark() ? "dark" : "light"));
  const theme = useMemo(() => buildTheme(mode), [mode]);
  const value = useMemo<ThemeContextValue>(() => ({ theme, setMode }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
