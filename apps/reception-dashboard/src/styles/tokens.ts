/**
 * Centralized design tokens (Prompt 0.2 foundation). Values ported directly
 * from apps/parent-mobile/src/styles/tokens.ts — same spacing/radii/color
 * numbers, so the two client surfaces read as the same product — NOT
 * imported from it: React Native's StyleSheet objects and a browser's CSS
 * cannot share a runtime representation, so this is a deliberate port of
 * values, not code reuse of the mobile module itself. `elevation` is
 * re-expressed as CSS `box-shadow` strings (the web equivalent of RN's
 * platform-specific shadow/elevation style fragments) rather than ported
 * as-is.
 *
 * Visual direction (matches apps/parent-mobile's own Prompt 1 direction,
 * applied here to a desktop-first operational dashboard instead of a
 * mobile app): modern, minimal, professional, enterprise-grade, accessible.
 * No gradients, no heavy shadows, no animation library.
 *
 * Also emitted as CSS custom properties (tokens.css) for use in plain CSS
 * files — this module is the single source of truth; tokens.css's values
 * must be kept in sync with it by hand until/unless a build-time generator
 * is justified (not yet, at this token count).
 */

export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  full: 999,
} as const;

export const iconSizes = {
  sm: 16,
  md: 24,
  lg: 32,
} as const;

/** Milliseconds. No animation library is included in this foundation. */
export const motion = {
  fast: 150,
  normal: 250,
  slow: 400,
} as const;

export const elevation = {
  none: "none",
  low: "0 1px 2px rgba(0, 0, 0, 0.06)",
  medium: "0 2px 6px rgba(0, 0, 0, 0.1)",
} as const;

export interface ColorPalette {
  background: string;
  surface: string;
  surfaceVariant: string;
  primary: string;
  onPrimary: string;
  secondary: string;
  onSecondary: string;
  success: string;
  onSuccess: string;
  warning: string;
  onWarning: string;
  error: string;
  onError: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textDisabled: string;
  overlay: string;
}

/** Semantic (not literal) color roles — same values and naming as
 * apps/parent-mobile/src/styles/tokens.ts's lightColors/darkColors. */
export const lightColors: ColorPalette = {
  background: "#FBFBFC",
  surface: "#FFFFFF",
  surfaceVariant: "#F1F2F5",
  primary: "#2F5FDB",
  onPrimary: "#FFFFFF",
  secondary: "#3F4B63",
  onSecondary: "#FFFFFF",
  success: "#1E8A5F",
  onSuccess: "#FFFFFF",
  warning: "#B4720A",
  onWarning: "#FFFFFF",
  error: "#C4392B",
  onError: "#FFFFFF",
  border: "#E2E4EA",
  textPrimary: "#171A21",
  textSecondary: "#5B6272",
  textDisabled: "#9AA0AC",
  overlay: "rgba(15, 17, 21, 0.4)",
};

export const darkColors: ColorPalette = {
  background: "#101216",
  surface: "#181B21",
  surfaceVariant: "#20242C",
  primary: "#7EA0F5",
  onPrimary: "#0A1330",
  secondary: "#AEB8CC",
  onSecondary: "#161A22",
  success: "#5FC79A",
  onSuccess: "#082C1D",
  warning: "#E3A03F",
  onWarning: "#3A2500",
  error: "#E5786C",
  onError: "#3A0E08",
  border: "#2A2E37",
  textPrimary: "#EDEFF3",
  textSecondary: "#AEB4C2",
  textDisabled: "#5B6272",
  overlay: "rgba(0, 0, 0, 0.6)",
};

export type ThemeMode = "light" | "dark";

export interface Theme {
  mode: ThemeMode;
  colors: ColorPalette;
  spacing: typeof spacing;
  radii: typeof radii;
  iconSizes: typeof iconSizes;
  motion: typeof motion;
  elevation: typeof elevation;
}

export function buildTheme(mode: ThemeMode): Theme {
  return {
    mode,
    colors: mode === "dark" ? darkColors : lightColors,
    spacing,
    radii,
    iconSizes,
    motion,
    elevation,
  };
}
