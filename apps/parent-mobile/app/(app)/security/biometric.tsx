import { useEffect, useState } from "react";
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View } from "react-native";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { SecurityInformationCard } from "@/src/components/ui/SecurityInformationCard";
import { Button } from "@/src/components/ui/Button";
import { Loader } from "@/src/components/feedback/Loader";
import { BiometricStatusCard } from "@/src/features/biometric/components/BiometricStatusCard";
import { BIOMETRIC_INFO_SECTIONS } from "@/src/features/biometric/biometricContent";
import { biometricResultMessage } from "@/src/features/biometric/biometricMessages";
import { canAuthenticate } from "@/src/features/biometric/biometricCapability";
import { useBiometric } from "@/src/hooks/useBiometric";
import { useTheme } from "@/src/hooks/useTheme";
import type { BiometricResultKind } from "@/src/services/biometric/biometric";

/**
 * Biometric Settings (Prompt 5). Lives under the existing `(app)/security`
 * area (Prompt 4B) rather than the still-fully-placeholder `(app)/settings`
 * screen — this IS the app's existing security-domain screen group.
 *
 * Enabling requires a REAL successful platform authentication
 * (`useBiometric().enable()` — see that hook's doc comment); a UI toggle
 * alone can never mark biometrics enabled. Disabling is immediate and has
 * no effect on Supabase credentials, trusted-device state, or backend
 * authorization — it only clears the local preference.
 */
export default function BiometricSettings() {
  const { theme } = useTheme();
  const { capabilities, isEnabled, isLoadingStatus, isAuthenticating, enable, disable } =
    useBiometric();
  const [lastResultKind, setLastResultKind] = useState<BiometricResultKind | null>(null);

  // See src/components/ui/TextField.tsx's identical fix — `accessibilityRole="alert"`
  // alone is not reliably announced by TalkBack/VoiceOver on this platform.
  // Placed before the early return below (rules of hooks).
  useEffect(() => {
    if (lastResultKind && lastResultKind !== "success") {
      AccessibilityInfo.announceForAccessibility(
        biometricResultMessage(lastResultKind).description,
      );
    }
  }, [lastResultKind]);

  const handleEnable = async () => {
    setLastResultKind(null);
    const result = await enable();
    setLastResultKind(result.kind);
  };

  const handleDisable = async () => {
    setLastResultKind(null);
    await disable();
  };

  if (isLoadingStatus || !capabilities) {
    return (
      <PageContainer>
        <Loader fullPage />
      </PageContainer>
    );
  }

  const usable = canAuthenticate(capabilities);
  const message =
    lastResultKind && lastResultKind !== "success" ? biometricResultMessage(lastResultKind) : null;

  return (
    <PageContainer>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <PageHeader
          title="Biometric authentication"
          subtitle="Use your device's fingerprint or face unlock to confirm it's you before sensitive actions."
        />

        <BiometricStatusCard capabilities={capabilities} isEnabled={isEnabled} />

        {message ? (
          <View
            style={[styles.messageBox, { marginTop: theme.spacing.md }]}
            accessibilityRole="alert"
          >
            <Text style={[styles.messageTitle, { color: theme.colors.error }]}>
              {message.title}
            </Text>
            <Text
              style={[
                styles.messageBody,
                { color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
              ]}
            >
              {message.description}
            </Text>
          </View>
        ) : null}

        <View style={{ marginTop: theme.spacing.md }}>
          <SecurityInformationCard sections={BIOMETRIC_INFO_SECTIONS} />
        </View>

        <View style={{ marginTop: theme.spacing.lg }}>
          {isEnabled ? (
            <Button
              label="Turn off biometric authentication"
              variant="secondary"
              fullWidth
              onPress={handleDisable}
              accessibilityHint="Stops using biometric authentication for sensitive actions on this device"
            />
          ) : (
            <Button
              label="Enable biometric authentication"
              fullWidth
              loading={isAuthenticating}
              disabled={!usable}
              onPress={handleEnable}
              accessibilityHint="Confirms your identity with your device's biometric authentication, then turns this on"
            />
          )}
        </View>
      </ScrollView>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 32 },
  messageBox: { paddingVertical: 4 },
  messageTitle: { fontSize: 14, fontWeight: "600" },
  messageBody: { fontSize: 13, lineHeight: 18 },
});
