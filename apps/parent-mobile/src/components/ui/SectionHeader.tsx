import { StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../contexts/ThemeContext";

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
}

/** Generic section-level heading (Prompt 7) — smaller than `PageHeader`,
 * intended for labeling a region of content within a page rather than the
 * page itself (e.g. each Home Dashboard section). Replaces the ad hoc
 * `styles.sectionTitle` `<Text>` pattern previously duplicated inline in
 * `security/index.tsx` — new call sites should use this instead; existing
 * ones are left as-is (unrelated to this prompt's scope). */
export function SectionHeader({ title, subtitle }: SectionHeaderProps) {
  const { theme } = useThemeContext();
  return (
    <View style={{ marginBottom: theme.spacing.sm }}>
      <Text style={[styles.title, { color: theme.colors.textPrimary }]} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary, marginTop: 2 }]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 13, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 },
  subtitle: { fontSize: 13 },
});
