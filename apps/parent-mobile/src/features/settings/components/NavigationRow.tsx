import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../../contexts/ThemeContext";

export interface NavigationRowProps {
  title: string;
  description?: string;
  onPress: () => void;
  accessibilityHint?: string;
  /** Small trailing text (e.g. a status word) — never a numeric badge
   * implying a count this app cannot authoritatively support. */
  trailingLabel?: string;
}

/** Generic settings/navigation row (Prompt 11) — reused for every Settings
 * Home entry and for rows within Account/Security/Legal screens. A chevron
 * would normally hint "navigates further," but no icon library exists in
 * this app (unchanged foundation decision) — the row's own
 * `accessibilityRole="button"` and full-row press target already make that
 * clear without one. */
export function NavigationRow({
  title,
  description,
  onPress,
  accessibilityHint,
  trailingLabel,
}: NavigationRowProps) {
  const { theme } = useThemeContext();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={styles.textColumn}>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{title}</Text>
        {description ? (
          <Text style={[styles.description, { color: theme.colors.textSecondary, marginTop: 2 }]}>
            {description}
          </Text>
        ) : null}
      </View>
      {trailingLabel ? (
        <Text style={[styles.trailing, { color: theme.colors.textDisabled }]}>{trailingLabel}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", minHeight: 44, paddingVertical: 10, gap: 8 },
  textColumn: { flex: 1 },
  title: { fontSize: 15, fontWeight: "600" },
  description: { fontSize: 13 },
  trailing: { fontSize: 13 },
});
