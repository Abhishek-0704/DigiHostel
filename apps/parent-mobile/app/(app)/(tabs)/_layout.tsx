import { Tabs } from "expo-router";
import { useTheme } from "@/src/hooks/useTheme";

/** Bottom-tab shell for the four primary Parent Application destinations —
 * Home, Notifications, History, Profile — per Prompt 7's
 * `<bottom_navigation>` instructions. `history` moved here from the
 * standalone `(app)/history` stack route in Prompt 7 specifically so it
 * appears in this primary tab bar; its screen content is still a
 * placeholder (unchanged business-logic scope). No tab icons are wired up —
 * no icon library is installed in this app (see `docs/foundation.md`'s
 * dependency rationale); labels only, consistent with every other screen.
 * No `tabBarBadge` is set on any screen — see `history.tsx`'s sibling
 * `notifications.tsx` and this app's `NotificationContext`: there is no
 * authoritative unread-count source yet, and a badge must never show a
 * fabricated number. */
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
      <Tabs.Screen name="index" options={{ title: "Home", tabBarAccessibilityLabel: "Home" }} />
      <Tabs.Screen
        name="notifications"
        options={{ title: "Notifications", tabBarAccessibilityLabel: "Notifications" }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: "History", tabBarAccessibilityLabel: "Approval History" }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile", tabBarAccessibilityLabel: "Profile" }}
      />
    </Tabs>
  );
}
