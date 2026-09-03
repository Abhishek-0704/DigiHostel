import { Stack } from "expo-router";

/** Unauthenticated route group (Prompt 1's Navigation Flow: Welcome → Login
 * → OTP). No auth-guard logic here — this group's screens are reachable
 * regardless of session state in this foundation pass. */
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="login" />
      <Stack.Screen name="otp" />
    </Stack>
  );
}
