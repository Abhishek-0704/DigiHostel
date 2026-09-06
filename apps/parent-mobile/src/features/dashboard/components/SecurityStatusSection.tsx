import { View } from "react-native";
import { useRouter } from "expo-router";
import { useThemeContext } from "../../../contexts/ThemeContext";
import { SectionHeader } from "../../../components/ui/SectionHeader";
import { Button } from "../../../components/ui/Button";
import { Skeleton } from "../../../components/feedback/Skeleton";
import { ErrorState } from "../../../components/feedback/ErrorState";
import { SecurityStatusCard } from "../../security/components/SecurityStatusCard";
import { deriveProtectionSummary } from "../../security/securityStatus";
import { getDeviceTrustState } from "../../devices/deviceStatus";
import { useDevice } from "../../../hooks/useDevice";
import { useBiometric } from "../../../hooks/useBiometric";

/**
 * Home Dashboard's Security Status widget (Prompt 7) — entirely built from
 * the Security Center's existing real infrastructure (Prompt 6):
 * `useDevice()`, `useBiometric()`, and `deriveProtectionSummary()` are the
 * exact same hooks/logic Security Center Home uses, so this widget shares
 * their TanStack Query cache rather than issuing a second, independent set
 * of queries. No new security-state system, no numeric score (see
 * `securityStatus.ts`'s own doc comment on why).
 */
export function SecurityStatusSection() {
  const { theme } = useThemeContext();
  const router = useRouter();
  const { devices, isLoading: isLoadingDevices, error } = useDevice();
  const { isEnabled: biometricEnabled, isLoadingStatus: isLoadingBiometric } = useBiometric();

  const isLoading = isLoadingDevices || isLoadingBiometric;

  return (
    <View style={{ marginTop: theme.spacing.lg }}>
      <SectionHeader title="Security status" />
      {isLoading ? (
        <View style={{ gap: 8 }}>
          <Skeleton height={72} />
        </View>
      ) : error ? (
        <ErrorState error={error} />
      ) : (
        <SecurityStatusCard
          summary={deriveProtectionSummary({
            hasActiveTrustedDevice: devices.some(
              (device) => getDeviceTrustState(device) === "active",
            ),
            biometricEnabled,
          })}
        />
      )}
      <View style={{ marginTop: theme.spacing.sm, alignItems: "flex-start" }}>
        <Button
          label="Go to Security Center"
          variant="ghost"
          onPress={() => router.push("/(app)/security")}
          accessibilityHint="Opens the Security Center for trusted devices and biometric settings"
        />
      </View>
    </View>
  );
}
