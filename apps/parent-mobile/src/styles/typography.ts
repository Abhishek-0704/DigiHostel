import { Platform, type TextStyle } from "react-native";

/**
 * Typography scale (Prompt 2 foundation). Uses the platform system font
 * (no custom font files bundled in this pass — adding one is a deliberate
 * future decision, not made here) so text renders correctly and accessibly
 * out of the box, including respecting the user's OS-level font-scaling
 * setting (React Native's default `Text` already does this; nothing here
 * disables it).
 */

const fontFamily = Platform.select({
  ios: "System",
  android: "sans-serif",
  default: "System",
});

export interface TypographyScale {
  displayLarge: TextStyle;
  headlineLarge: TextStyle;
  headlineMedium: TextStyle;
  titleLarge: TextStyle;
  titleMedium: TextStyle;
  bodyLarge: TextStyle;
  bodyMedium: TextStyle;
  bodySmall: TextStyle;
  label: TextStyle;
}

export const typography: TypographyScale = {
  displayLarge: { fontFamily, fontSize: 34, fontWeight: "700", lineHeight: 40 },
  headlineLarge: { fontFamily, fontSize: 26, fontWeight: "700", lineHeight: 32 },
  headlineMedium: { fontFamily, fontSize: 22, fontWeight: "600", lineHeight: 28 },
  titleLarge: { fontFamily, fontSize: 18, fontWeight: "600", lineHeight: 24 },
  titleMedium: { fontFamily, fontSize: 16, fontWeight: "600", lineHeight: 22 },
  bodyLarge: { fontFamily, fontSize: 16, fontWeight: "400", lineHeight: 22 },
  bodyMedium: { fontFamily, fontSize: 14, fontWeight: "400", lineHeight: 20 },
  bodySmall: { fontFamily, fontSize: 12, fontWeight: "400", lineHeight: 16 },
  label: { fontFamily, fontSize: 13, fontWeight: "600", lineHeight: 16 },
};
