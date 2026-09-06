import { StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../contexts/ThemeContext";

export type SecurityBannerTone = "info" | "success" | "warning" | "error";

export interface SecurityBannerProps {
  tone?: SecurityBannerTone;
  message: string;
}

/** A calm, single-line reassurance/warning banner — e.g. "Your device is
 * trusted." or "This device is no longer trusted." Deliberately restrained:
 * a tinted surface + a colored left accent, not a saturated full-color
 * fill, matching this app's "calm, professional, minimal" direction. Color
 * is never the only signal — the message text itself always states the
 * state in words.
 *
 * Relocated here from `features/devices/components/` in Prompt 9A once a
 * second feature (leave-approval confirmation panels) needed the identical
 * renderer — same rationale/precedent as `SecurityInformationCard`'s
 * Prompt 5 relocation (`docs/authentication.md` §15/§16). Name kept
 * unchanged, matching that same precedent, even though it now also covers
 * non-security banners. */
export function SecurityBanner({ tone = "info", message }: SecurityBannerProps) {
  const { theme } = useThemeContext();

  const accentColor: Record<SecurityBannerTone, string> = {
    info: theme.colors.primary,
    success: theme.colors.success,
    warning: theme.colors.warning,
    error: theme.colors.error,
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surfaceVariant,
          borderRadius: theme.radii.md,
          borderLeftColor: accentColor[tone],
          padding: theme.spacing.md,
        },
      ]}
      accessibilityRole={tone === "error" || tone === "warning" ? "alert" : "text"}
      accessible
    >
      <Text style={[styles.message, { color: theme.colors.textPrimary }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderLeftWidth: 3 },
  message: { fontSize: 14, lineHeight: 20 },
});
