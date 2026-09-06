import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { Loader } from "@/src/components/feedback/Loader";
import { ErrorState } from "@/src/components/feedback/ErrorState";
import { Button } from "@/src/components/ui/Button";
import { CurrentDeviceBanner } from "@/src/features/devices/components/CurrentDeviceBanner";
import { SecurityStatusCard } from "@/src/features/security/components/SecurityStatusCard";
import { RecommendationCard } from "@/src/features/security/components/RecommendationCard";
import { deriveProtectionSummary } from "@/src/features/security/securityStatus";
import {
  deriveSecurityRecommendations,
  type RecommendationActionTarget,
} from "@/src/features/security/securityRecommendations";
import { canAuthenticate } from "@/src/features/biometric/biometricCapability";
import { getDeviceTrustState } from "@/src/features/devices/deviceStatus";
import { useDevice } from "@/src/hooks/useDevice";
import { useBiometric } from "@/src/hooks/useBiometric";
import { useTheme } from "@/src/hooks/useTheme";

const RECOMMENDATION_ROUTE: Record<
  RecommendationActionTarget,
  "/(app)/security/biometric" | "/(app)/security/devices" | "/(app)/security/tips"
> = {
  "biometric-settings": "/(app)/security/biometric",
  "devices-list": "/(app)/security/devices",
  "security-tips": "/(app)/security/tips",
};

/**
 * Security Center Home (Prompt 6) — the new landing screen for
 * `/(app)/security`, replacing what was previously the Trusted Devices
 * List directly at this route (that list now lives at
 * `security/devices.tsx` — see that file's own doc comment). This is the
 * "security dashboard" this prompt's own instructions describe: a
 * protection-status summary, the current device, a biometric status link,
 * real recommendations, and navigation into the rest of the Security
 * Center — never a fabricated numeric score (see `securityStatus.ts`).
 *
 * All state here is read, never independently re-fetched: `useDevice()`
 * and `useBiometric()` are the exact same TanStack-Query-backed /
 * preference-backed hooks every other Security Center screen uses, so this
 * screen shares their cache rather than issuing its own duplicate queries.
 */
export default function SecurityCenterHome() {
  const { theme } = useTheme();
  const router = useRouter();
  const { devices, isLoading: isLoadingDevices, isRefreshing, error, refresh } = useDevice();
  const {
    capabilities,
    isEnabled: biometricEnabled,
    isLoadingStatus: isLoadingBiometric,
    refreshStatus: refreshBiometricStatus,
  } = useBiometric();

  const isLoading = isLoadingDevices || isLoadingBiometric;

  const handleRefresh = async () => {
    await Promise.all([refresh(), refreshBiometricStatus()]);
  };

  if (isLoading && devices.length === 0 && !error) {
    return (
      <PageContainer>
        <Loader fullPage />
      </PageContainer>
    );
  }

  if (error && devices.length === 0) {
    return (
      <PageContainer>
        <ErrorState error={error} onRetry={refresh} />
      </PageContainer>
    );
  }

  const hasActiveTrustedDevice = devices.some((device) => getDeviceTrustState(device) === "active");
  const protectionSummary = deriveProtectionSummary({ hasActiveTrustedDevice, biometricEnabled });
  const recommendations = capabilities
    ? deriveSecurityRecommendations({
        biometricCapable: canAuthenticate(capabilities),
        biometricEnabled,
        devices,
      })
    : [];

  return (
    <PageContainer>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        <PageHeader
          title="Security Center"
          subtitle="Review your trusted devices and account protection."
        />

        <SecurityStatusCard summary={protectionSummary} />

        <View style={{ marginTop: theme.spacing.md }}>
          <CurrentDeviceBanner devices={devices} />
        </View>

        {recommendations.length > 0 ? (
          <View style={{ marginTop: theme.spacing.lg }}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
              Recommendations
            </Text>
            <View style={{ marginTop: theme.spacing.sm, gap: 8 }}>
              {recommendations.map((recommendation) => (
                <RecommendationCard
                  key={recommendation.id}
                  recommendation={recommendation}
                  onAction={() => router.push(RECOMMENDATION_ROUTE[recommendation.actionTarget])}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ marginTop: theme.spacing.lg, gap: 8 }}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
            Manage security
          </Text>
          <Button
            label={`Trusted devices (${devices.length})`}
            variant="secondary"
            fullWidth
            onPress={() => router.push("/(app)/security/devices")}
            accessibilityHint="View and manage your trusted devices"
          />
          <Button
            label="Biometric authentication"
            variant="secondary"
            fullWidth
            onPress={() => router.push("/(app)/security/biometric")}
            accessibilityHint="View and change your biometric authentication settings"
          />
          <Button
            label="Security tips"
            variant="ghost"
            fullWidth
            onPress={() => router.push("/(app)/security/tips")}
          />
        </View>
      </ScrollView>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 32 },
  sectionTitle: { fontSize: 13, fontWeight: "600" },
});
