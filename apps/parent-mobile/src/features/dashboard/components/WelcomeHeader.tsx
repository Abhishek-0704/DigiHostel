import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../../contexts/ThemeContext";
import { formatFullDate, WELCOME_GREETING } from "../dashboardContent";

/** Home Dashboard's personalized greeting block (Prompt 7). Deliberately
 * generic — see `dashboardContent.ts`'s doc comment: no parent display-name
 * source exists anywhere in this app's architecture, so this never invents
 * one. `useMemo` avoids recomputing the date string on every re-render
 * (e.g. a pull-to-refresh elsewhere on the page); it still reflects
 * "today" on next mount/day change, which is all a dashboard greeting
 * needs. */
export function WelcomeHeader() {
  const { theme } = useThemeContext();
  const dateLabel = useMemo(() => formatFullDate(new Date()), []);

  return (
    <View style={{ marginBottom: theme.spacing.lg }}>
      <Text
        style={[styles.greeting, { color: theme.colors.textPrimary }]}
        accessibilityRole="header"
      >
        {WELCOME_GREETING}
      </Text>
      <Text style={[styles.date, { color: theme.colors.textSecondary, marginTop: 2 }]}>
        {dateLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  greeting: { fontSize: 24, fontWeight: "700" },
  date: { fontSize: 14 },
});
