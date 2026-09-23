import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { buildTheme, type Theme, type ThemeMode } from "../styles/tokens";

/** The user's actual CHOICE, distinct from `ThemeMode` (the resolved
 * light/dark value `buildTheme` consumes) — "system" has no fixed
 * resolution; it tracks the OS preference live. Phase 7, Prompt 17
 * (Administrative Profile & Personal Preferences Center) is the "future
 * Settings page" this file's own prior doc comment named as the missing
 * manual-override UI; persistence lives in `staff_preferences`
 * (`features/profile/useProfile.ts`), never duplicated here — this context
 * remains pure UI state, with no data-fetching of its own, exactly as
 * before (ThemeProvider mounts above authentication, for the login screen
 * too, so it must never assume an authenticated profile is available).
 */
export type ThemePreference = "light" | "dark" | "system";
export type FontScalePreference = "default" | "large" | "larger";

interface ThemeContextValue {
  theme: Theme;
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
  reducedMotion: boolean;
  setReducedMotion: (value: boolean) => void;
  highContrast: boolean;
  setHighContrast: (value: boolean) => void;
  fontScale: FontScalePreference;
  setFontScale: (value: FontScalePreference) => void;
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
  );
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const [systemIsDark, setSystemIsDark] = useState<boolean>(systemPrefersDark);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [fontScale, setFontScale] = useState<FontScalePreference>("default");

  // Live-tracks the OS preference while `themePreference === "system"` —
  // without this, a user who picked "System" and then changes their OS
  // theme mid-session would see a stale resolved value until next reload.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const mode = useMemo<ThemeMode>(
    () => (themePreference === "system" ? (systemIsDark ? "dark" : "light") : themePreference),
    [themePreference, systemIsDark],
  );
  const theme = useMemo(() => buildTheme(mode), [mode]);

  // Applies every display/accessibility preference to <html> as a
  // `data-*` attribute — tokens.css's own [data-*] rules (Phase 7, Prompt
  // 17) read these; this is the ONE place any of them touches the real
  // DOM, so every consumer of this context stays declarative.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.dataset.theme = mode;
    root.dataset.reducedMotion = reducedMotion ? "true" : "false";
    root.dataset.highContrast = highContrast ? "true" : "false";
    root.dataset.fontScale = fontScale;
  }, [mode, reducedMotion, highContrast, fontScale]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      themePreference,
      setThemePreference,
      reducedMotion,
      setReducedMotion,
      highContrast,
      setHighContrast,
      fontScale,
      setFontScale,
    }),
    [theme, themePreference, reducedMotion, highContrast, fontScale],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
