import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppProviders } from "@/src/providers/AppProviders";
import { AuthGate } from "@/src/navigation/AuthGate";

/**
 * Root layout (Prompt 2 foundation; route protection wired in Prompt 3).
 * Composes AppProviders once for the whole route tree, then AuthGate
 * (src/navigation/AuthGate.tsx) redirects between the (auth)/(onboarding)/
 * (app) groups based on AuthContext's canonical status — see
 * apps/parent-mobile/docs/authentication.md for the full state machine.
 */
export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="auto" />
      <AuthGate>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(onboarding)" />
          <Stack.Screen name="(app)" />
        </Stack>
      </AuthGate>
    </AppProviders>
  );
}
