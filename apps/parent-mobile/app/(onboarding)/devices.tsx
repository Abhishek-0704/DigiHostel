import { ScrollView, StyleSheet, Text, View } from "react-native";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { Button } from "@/src/components/ui/Button";
import { Loader } from "@/src/components/feedback/Loader";
import { ErrorState } from "@/src/components/feedback/ErrorState";
import { SecurityInformationCard } from "@/src/components/ui/SecurityInformationCard";
import { DEVICE_REGISTRATION_SECTIONS } from "@/src/features/devices/deviceContent";
import {
  registrationStatusMessage,
  type RegistrationUiState,
} from "@/src/features/devices/registrationState";
import { useDevice } from "@/src/hooks/useDevice";
import { useTheme } from "@/src/hooks/useTheme";

/**
 * Trusted Device Registration (Prompt 4B). `deviceService.registerCurrentDevice()`
 * is fail-closed by design (ADR-003 requires platform attestation before a
 * device is marked trusted, and no attestation-verification integration
 * exists yet — see docs/authentication.md §5/§15) — pressing "Verify this
 * device" therefore always ends in the `failed` state today, with the
 * pre-approved `device_registration_unavailable` message. That is the
 * correct, honest behavior, not a bug: this screen must never fabricate a
 * successful registration.
 *
 * If a future backend/attestation integration makes `registerCurrentDevice`
 * actually succeed, `useDevice().register()` already calls
 * `AuthContext.refreshDeviceStatus()` on success — `AuthGate` (unchanged,
 * Prompt 3) picks up the resulting "authenticated" status and redirects
 * away from this screen on its own. No redirect logic is duplicated here.
 */
export default function OnboardingDevices() {
  const { theme } = useTheme();
  const { register, isRegistering, registrationError } = useDevice();

  const uiState: RegistrationUiState = isRegistering
    ? "registering"
    : registrationError
      ? "failed"
      : "idle";
  const liveMessage = registrationStatusMessage(uiState);

  const handleVerify = () => {
    register().catch(() => {
      // registrationError (from the hook) already carries the mapped
      // AppError — nothing further to do here. Swallowed so an unhandled
      // rejection doesn't surface in the console for expected, fail-closed
      // behavior.
    });
  };

  return (
    <PageContainer>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <PageHeader
          title="Verify this device"
          subtitle="This device needs to be verified before it can approve your child's leave requests."
        />

        {liveMessage ? (
          <Text accessibilityLiveRegion="polite" style={styles.srOnlyLive}>
            {liveMessage}
          </Text>
        ) : null}

        {uiState === "registering" ? (
          <View style={styles.centerBlock}>
            <Loader fullPage={false} />
            <Text
              style={[
                styles.statusText,
                { color: theme.colors.textSecondary, marginTop: theme.spacing.sm },
              ]}
            >
              Verifying your device…
            </Text>
          </View>
        ) : uiState === "failed" && registrationError ? (
          <ErrorState error={registrationError} onRetry={handleVerify} />
        ) : (
          <SecurityInformationCard sections={DEVICE_REGISTRATION_SECTIONS} />
        )}

        {uiState === "idle" ? (
          <View style={{ marginTop: theme.spacing.lg }}>
            <Button
              label="Verify this device"
              fullWidth
              onPress={handleVerify}
              accessibilityHint="Attempts to register this device as trusted"
            />
          </View>
        ) : null}
      </ScrollView>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 32 },
  centerBlock: { alignItems: "center", paddingVertical: 32 },
  statusText: { fontSize: 14 },
  // Visually hidden but screen-reader-announced — a dedicated live text
  // node separate from the visible status text above so the announcement
  // fires exactly once per state change rather than being tied to a node
  // that also carries other re-rendering content.
  srOnlyLive: { position: "absolute", width: 1, height: 1, opacity: 0 },
});
