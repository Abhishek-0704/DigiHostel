import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../../contexts/ThemeContext";
import type { DashboardQuickAction } from "../dashboardQuickActions";

export interface QuickActionCardProps {
  action: DashboardQuickAction;
  onPress: () => void;
}

/** A single Quick Action tile — pure presentation, no navigation knowledge
 * of its own (the route lives in `dashboardQuickActions.ts`; `onPress` is
 * supplied by the caller). Minimum 44pt touch target per this app's
 * accessibility foundation. */
export function QuickActionCard({ action, onPress }: QuickActionCardProps) {
  const { theme } = useThemeContext();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={action.title}
      accessibilityHint={action.accessibilityHint}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.lg,
          padding: theme.spacing.md,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={{ minHeight: 44, justifyContent: "center" }}>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{action.title}</Text>
        <Text style={[styles.description, { color: theme.colors.textSecondary, marginTop: 2 }]}>
          {action.description}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: "48%", borderWidth: 1 },
  title: { fontSize: 14, fontWeight: "600" },
  description: { fontSize: 12, lineHeight: 16 },
});
