import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useThemeContext } from "../../../contexts/ThemeContext";
import { SectionHeader } from "../../../components/ui/SectionHeader";
import { QuickActionCard } from "./QuickActionCard";
import { DASHBOARD_QUICK_ACTIONS } from "../dashboardQuickActions";

/** Renders `DASHBOARD_QUICK_ACTIONS` — configuration-driven so a future
 * module (e.g. Profile business logic) adds a quick action by extending
 * that array, not by editing this component. Every entry navigates to an
 * already-real route; nothing here triggers feature business logic. */
export function QuickActionsSection() {
  const { theme } = useThemeContext();
  const router = useRouter();

  return (
    <View style={{ marginTop: theme.spacing.lg }}>
      <SectionHeader title="Quick actions" />
      <View style={styles.grid}>
        {DASHBOARD_QUICK_ACTIONS.map((action) => (
          <QuickActionCard
            key={action.id}
            action={action}
            onPress={() => router.push(action.route)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
});
