import { Stack } from "expo-router";

/** Authenticated route group — reached only once `AuthGate`
 * (`src/navigation/AuthGate.tsx`, wired in the root `app/_layout.tsx`)
 * resolves status to `"authenticated"`; this layout itself performs no
 * additional guard. The History list itself has no Stack.Screen here — as
 * of Prompt 7 it lives inside `(tabs)` as a primary bottom-nav destination
 * (see `(tabs)/_layout.tsx`), not a separately-pushed screen. `history/[id]`
 * (Phase 4 Prompt 10) IS a separately-pushed screen — the read-only History
 * Detail record, distinct from the tab list and from `leave/[id]` (the
 * active decision screen). */
export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="leave/index" options={{ headerShown: true, title: "Leave Requests" }} />
      <Stack.Screen name="leave/[id]" options={{ headerShown: true, title: "Leave Request" }} />
      <Stack.Screen name="history/[id]" options={{ headerShown: true, title: "History Record" }} />
      <Stack.Screen name="profile/edit" options={{ headerShown: true, title: "Edit Profile" }} />
      <Stack.Screen
        name="profile/students/[id]"
        options={{ headerShown: true, title: "Student" }}
      />
      <Stack.Screen
        name="notifications/[id]"
        options={{ headerShown: true, title: "Notification" }}
      />
      <Stack.Screen
        name="notifications/settings"
        options={{ headerShown: true, title: "Notification Settings" }}
      />
      <Stack.Screen
        name="security/index"
        options={{ headerShown: true, title: "Security Center" }}
      />
      <Stack.Screen
        name="security/devices"
        options={{ headerShown: true, title: "Trusted Devices" }}
      />
      <Stack.Screen
        name="security/[deviceId]"
        options={{ headerShown: true, title: "Device Details" }}
      />
      <Stack.Screen name="security/tips" options={{ headerShown: true, title: "Security Tips" }} />
      <Stack.Screen
        name="security/biometric"
        options={{ headerShown: true, title: "Biometric Authentication" }}
      />
      <Stack.Screen name="settings/index" options={{ headerShown: true, title: "Settings" }} />
      <Stack.Screen name="settings/account" options={{ headerShown: true, title: "Account" }} />
      <Stack.Screen name="settings/security" options={{ headerShown: true, title: "Security" }} />
      <Stack.Screen name="settings/privacy" options={{ headerShown: true, title: "Privacy" }} />
      <Stack.Screen name="settings/legal" options={{ headerShown: true, title: "Legal" }} />
      <Stack.Screen
        name="settings/legal/[doc]"
        options={{ headerShown: true, title: "Legal Document" }}
      />
      <Stack.Screen name="help/index" options={{ headerShown: true, title: "Help" }} />
      <Stack.Screen name="about/index" options={{ headerShown: true, title: "About" }} />
    </Stack>
  );
}
