import { StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../contexts/ThemeContext";

export type BadgeTone = "neutral" | "primary" | "success" | "warning" | "error";

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
}

/** Generic status badge — intended for the future `LeaveRequestCard`'s
 * status indicator, but deliberately carries no leave-status-specific
 * mapping itself (e.g. no "pending"/"approved" strings here) so it stays
 * reusable beyond that one feature. */
export function Badge({ label, tone = "neutral" }: BadgeProps) {
  const { theme } = useThemeContext();

  const toneColors: Record<BadgeTone, { background: string; text: string }> = {
    neutral: { background: theme.colors.surfaceVariant, text: theme.colors.textSecondary },
    primary: { background: theme.colors.primary, text: theme.colors.onPrimary },
    success: { background: theme.colors.success, text: theme.colors.onSuccess },
    warning: { background: theme.colors.warning, text: theme.colors.onWarning },
    error: { background: theme.colors.error, text: theme.colors.onError },
  };
  const { background, text } = toneColors[tone];

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: background, borderRadius: theme.radii.full, paddingHorizontal: 10 },
      ]}
    >
      <Text style={[styles.label, { color: text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignSelf: "flex-start", paddingVertical: 4 },
  label: { fontSize: 12, fontWeight: "600" },
});
