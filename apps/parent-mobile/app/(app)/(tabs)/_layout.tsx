import { Tabs } from "expo-router";
import { useTheme } from "@/src/hooks/useTheme";

/** Bottom-tab shell for the three tab-level destinations (Dashboard,
 * Notifications, Profile — Prompt 1's Navigation Flow). No tab icons are
 * wired up yet — no icon library is installed in this foundation pass (see
 * the foundation report's dependency rationale); labels only for now. */
export default function TabsLayout() {
  const { theme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Dashboard" }} />
      <Tabs.Screen name="notifications" options={{ title: "Notifications" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
