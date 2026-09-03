/**
 * Centralized design tokens (Prompt 2 — Parent Mobile Application foundation).
 * Plain data, no component logic here. Every visual value used by a
 * component in this app should trace back to one of these tokens rather
 * than a hardcoded literal, so the app can be re-themed from one place.
 *
 * Visual direction (Prompt 1): minimal, elegant, professional, accessible,
 * premium-SaaS-inspired, Material Design 3-influenced — restrained, not
 * decorative. No gradients, no heavy shadows, no animation library.
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

/** Milliseconds. No animation library is included in this foundation — these
 * exist so a future `Animated`/`react-native-reanimated` addition (a later
 * decision, not made here) has a single, consistent timing scale to read
 * from rather than scattered literals. */
export const motion = {
  fast: 150,
  normal: 250,
  slow: 400,
} as const;

/** Restrained elevation — two levels only, matching the "avoid unnecessary
 * visual complexity" direction. Values are React Native shadow/elevation
 * style fragments, not raw numbers, since iOS/Android require different
 * properties for the same visual effect. */
export const elevation = {
  none: {},
  low: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  medium: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
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

/** Semantic (not literal) color roles, Material Design 3-influenced naming.
 * Kept to the roles this foundation's shared components actually need —
 * extend deliberately, don't pre-populate every possible M3 role speculatively. */
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
