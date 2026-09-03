import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppProviders } from "@/src/providers/AppProviders";

/**
 * Root layout (Prompt 2 foundation). Composes AppProviders once for the
 * whole route tree and declares the top-level route groups. No auth-gating
 * logic here yet — deciding which group a session should land in is
 * explicitly out of this prompt's scope (see (auth)/(onboarding)/(app)'s
 * own layout files' doc comments for the placeholder navigation guard
 * they'll eventually need).
 */
export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </AppProviders>
  );
}
