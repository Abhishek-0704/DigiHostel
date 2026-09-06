import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../contexts/ThemeContext";

export interface DetailRowProps {
  label: string;
  value: string | ReactNode;
}

/** Small label/value row — the same shape already used inline in
 * `security/[deviceId].tsx` and `notifications/[id].tsx`. Originally
 * extracted for `leave-approval`'s own Student/Leave Information sections;
 * relocated here in Prompt 11 once Profile needed the identical renderer —
 * same relocation precedent as `SecurityBanner`/`ConfirmationPanel`. */
export function DetailRow({ label, value }: DetailRowProps) {
  const { theme } = useThemeContext();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: theme.colors.textSecondary }]}>{label}</Text>
      {typeof value === "string" ? (
        <Text style={[styles.value, { color: theme.colors.textPrimary }]}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    gap: 12,
  },
  label: { fontSize: 13 },
  value: { fontSize: 13, fontWeight: "600", flexShrink: 1, textAlign: "right" },
});
