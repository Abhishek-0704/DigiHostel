import { Stack } from "expo-router";

/** Post-OTP, pre-dashboard device-trust setup group (ADR-003's sequence:
 * attestation → device registration → biometric enrollment). Prompt 1
 * flagged the exact screen-by-screen split here as inferred, not
 * SDD-specified — kept to a single "devices" placeholder route rather than
 * inventing sub-screens the SDD doesn't name. */
export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="devices" />
    </Stack>
  );
}
