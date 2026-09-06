import { StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../../contexts/ThemeContext";
import { Card } from "../../../components/ui/Card";
import { SectionHeader } from "../../../components/ui/SectionHeader";
import { FUTURE_INSIGHT_PLACEHOLDERS } from "../dashboardContent";

/** Future-ready insight/metric tiles (Prompt 7) — UI structure only, per this
 * prompt's explicit `<future_insights>` boundary: no analytics calculation,
 * no fabricated chart or statistic. Each tile shows only a label and
 * "Coming soon" — never a number this app has no authoritative source for. */
export function FutureInsightsSection() {
  const { theme } = useThemeContext();

  return (
    <View style={{ marginTop: theme.spacing.lg, marginBottom: theme.spacing.xl }}>
      <SectionHeader title="Insights" subtitle="More detail is coming in a future update." />
      <View style={styles.row}>
        {FUTURE_INSIGHT_PLACEHOLDERS.map((metric) => (
          <Card key={metric.id} style={styles.tile}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
              {metric.label}
            </Text>
            <Text style={[styles.value, { color: theme.colors.textDisabled, marginTop: 4 }]}>
              Coming soon
            </Text>
          </Card>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { minWidth: "31%", flexGrow: 1 },
  label: { fontSize: 12, fontWeight: "600" },
  value: { fontSize: 13 },
});
