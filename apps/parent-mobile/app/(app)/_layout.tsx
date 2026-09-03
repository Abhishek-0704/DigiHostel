import { Stack } from "expo-router";

/** Authenticated route group. No auth guard implemented yet (out of this
 * prompt's scope) — reachable unconditionally in this foundation pass. */
export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="leave/[id]" options={{ headerShown: true, title: "Leave Request" }} />
      <Stack.Screen name="history/index" options={{ headerShown: true, title: "History" }} />
      <Stack.Screen name="security/index" options={{ headerShown: true, title: "Security" }} />
      <Stack.Screen name="settings/index" options={{ headerShown: true, title: "Settings" }} />
      <Stack.Screen name="help/index" options={{ headerShown: true, title: "Help" }} />
      <Stack.Screen name="about/index" options={{ headerShown: true, title: "About" }} />
    </Stack>
  );
}
