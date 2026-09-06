import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../contexts/ThemeContext";

export interface PageHeaderAction {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
}

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Renders a back button when provided (Prompt 7). Not consumed by any
   * screen in this pass: every `(tabs)` screen is a navigation root (no
   * "back" semantics), and every Stack-pushed screen already gets a native
   * back button from `headerShown: true` (`app/(app)/_layout.tsx`). Kept as
   * an optional, zero-behavior-change prop so a future screen that renders
   * its own header without a native Stack header can reuse this component
   * instead of building a second one. */
  onBackPress?: () => void;
  /** Up to a couple of lightweight text actions (e.g. a future "Profile"
   * shortcut) — Prompt 7's `<global_header>` capability. Deliberately not
   * populated by the Home Dashboard: the four-item bottom tab bar already
   * provides Notifications/Profile navigation, so duplicating that as header
   * buttons would add chrome without adding capability. */
  actions?: PageHeaderAction[];
}

export function PageHeader({ title, subtitle, onBackPress, actions }: PageHeaderProps) {
  const { theme } = useThemeContext();
  return (
    <View style={{ marginBottom: theme.spacing.md }}>
      <View style={styles.row}>
        {onBackPress ? (
          <Pressable
            onPress={onBackPress}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            style={styles.backButton}
          >
            <Text style={[styles.backLabel, { color: theme.colors.primary }]}>Back</Text>
          </Pressable>
        ) : null}
        <View style={styles.titleColumn}>
          <Text
            style={[styles.title, { color: theme.colors.textPrimary }]}
            accessibilityRole="header"
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[
                styles.subtitle,
                { color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
              ]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {actions && actions.length > 0 ? (
          <View style={styles.actions}>
            {actions.map((action) => (
              <Pressable
                key={action.label}
                onPress={action.onPress}
                accessibilityRole="button"
                accessibilityLabel={action.accessibilityLabel ?? action.label}
                hitSlop={8}
                style={styles.actionButton}
              >
                <Text style={[styles.actionLabel, { color: theme.colors.primary }]}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  titleColumn: { flex: 1 },
  title: { fontSize: 22, fontWeight: "700" },
  subtitle: { fontSize: 14 },
  backButton: { minHeight: 44, justifyContent: "center", paddingRight: 12 },
  backLabel: { fontSize: 15, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 4 },
  actionButton: { minHeight: 44, justifyContent: "center", paddingLeft: 8 },
  actionLabel: { fontSize: 13, fontWeight: "600" },
});
