import { ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { Card } from "@/src/components/ui/Card";
import { Badge } from "@/src/components/ui/Badge";
import { DetailRow } from "@/src/components/ui/DetailRow";
import { SectionHeader } from "@/src/components/ui/SectionHeader";
import { NavigationRow } from "@/src/features/settings/components/NavigationRow";
import { Skeleton } from "@/src/components/feedback/Skeleton";
import { useDevice } from "@/src/hooks/useDevice";
import { useBiometric } from "@/src/hooks/useBiometric";
import { canAuthenticate } from "@/src/features/biometric/biometricCapability";
import { getDeviceTrustState } from "@/src/features/devices/deviceStatus";
import { useTheme } from "@/src/hooks/useTheme";

/**
 * Settings → Security (Prompt 11). This is an ENTRY POINT into the existing
 * Security Center — it reuses `useDevice()`/`useBiometric()` (Prompt 3/5/6)
 * for a real summary and navigates into the existing `/(app)/security/*`
 * routes for every actual action. No new trusted-device/biometric state is
 * created here, and nothing on this screen can change security state
 * itself — see this prompt's explicit "do not duplicate the Device
 * Security Center" instruction.
 *
 * Device attestation (ADR-003) and cryptographic backend biometric
 * verification remain unimplemented/placeholder exactly as documented
 * elsewhere (`docs/current-state.md`) — this screen makes no stronger claim
 * than the Security Center itself already does.
 */
export default function SecuritySettings() {
  const { theme } = useTheme();
  const router = useRouter();
  const { devices, isLoading: isLoadingDevices } = useDevice();
  const {
    capabilities,
    isEnabled: biometricEnabled,
    isLoadingStatus: isLoadingBiometric,
  } = useBiometric();

  const activeDeviceCount = devices.filter(
    (device) => getDeviceTrustState(device) === "active",
  ).length;
  const isLoading = isLoadingDevices || isLoadingBiometric;

  return (
    <PageContainer>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <PageHeader title="Security" />

        <SectionHeader title="Current status" />
        {isLoading ? (
          <Skeleton height={90} />
        ) : (
          <Card>
            <DetailRow
              label="Trusted devices"
              value={
                <Badge
                  label={`${activeDeviceCount} active`}
                  tone={activeDeviceCount > 0 ? "success" : "warning"}
                />
              }
            />
            <DetailRow
              label="Biometric authentication"
              value={
                <Badge
                  label={biometricEnabled ? "Enabled" : "Not enabled"}
                  tone={biometricEnabled ? "success" : "neutral"}
                />
              }
            />
            <DetailRow
              label="Biometric capability"
              value={
                <Badge
                  label={
                    capabilities && canAuthenticate(capabilities) ? "Available" : "Unavailable"
                  }
                  tone="neutral"
                />
              }
            />
          </Card>
        )}

        <View style={{ marginTop: theme.spacing.lg }}>
          <SectionHeader title="Manage security" />
          <Card>
            <NavigationRow
              title="Security Center"
              description="Full trusted-device and protection overview"
              onPress={() => router.push("/(app)/security")}
              accessibilityHint="Opens the Security Center"
            />
          </Card>
          <View style={{ marginTop: theme.spacing.sm }}>
            <Card>
              <NavigationRow
                title="Trusted devices"
                description="Review and manage devices that can approve leave requests"
                onPress={() => router.push("/(app)/security/devices")}
                accessibilityHint="Opens the trusted devices list"
              />
            </Card>
          </View>
          <View style={{ marginTop: theme.spacing.sm }}>
            <Card>
              <NavigationRow
                title="Biometric authentication"
                description="Turn biometric confirmation on or off for this device"
                onPress={() => router.push("/(app)/security/biometric")}
                accessibilityHint="Opens biometric authentication settings"
              />
            </Card>
          </View>
          <View style={{ marginTop: theme.spacing.sm }}>
            <Card>
              <NavigationRow
                title="Security tips"
                description="Guidance for keeping your account secure"
                onPress={() => router.push("/(app)/security/tips")}
                accessibilityHint="Opens security tips"
              />
            </Card>
          </View>
        </View>
      </ScrollView>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 32 },
});
