import { StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../../contexts/ThemeContext";
import { Card } from "../../../components/ui/Card";
import type { ProtectionSummary } from "../securityStatus";

const TONE_ACCENT_KEY: Record<ProtectionSummary["tone"], "success" | "warning" | "primary"> = {
  success: "success",
  neutral: "primary",
  warning: "warning",
};

/** Renders `deriveProtectionSummary`'s output — a qualitative label +
 * explanatory sentence, never a numeric score (see securityStatus.ts's own
 * doc comment on why). A colored left accent mirrors `SecurityBanner`'s own
 * restrained style, but the label/description text always carries the
 * actual meaning — color is never the only signal. */
export function SecurityStatusCard({ summary }: { summary: ProtectionSummary }) {
  const { theme } = useThemeContext();
  const accentColor = theme.colors[TONE_ACCENT_KEY[summary.tone]];

  return (
    <Card style={[styles.card, { borderLeftColor: accentColor }]}>
      <View accessibilityRole="text" accessible>
        <Text style={[styles.label, { color: theme.colors.textPrimary }]}>{summary.label}</Text>
        <Text
          style={[
            styles.description,
            { color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
          ]}
        >
          {summary.description}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderLeftWidth: 3 },
  label: { fontSize: 16, fontWeight: "600" },
  description: { fontSize: 13, lineHeight: 18 },
});
