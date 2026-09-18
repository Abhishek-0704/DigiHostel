import { useEffect, useState } from "react";
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View } from "react-native";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { Card } from "@/src/components/ui/Card";
import { Button } from "@/src/components/ui/Button";
import { DetailRow } from "@/src/components/ui/DetailRow";
import { ConfirmationPanel } from "@/src/components/ui/ConfirmationPanel";
import { SectionHeader } from "@/src/components/ui/SectionHeader";
import { useProfile } from "@/src/features/profile/hooks/useProfile";
import { formatLeaveDate } from "@/src/features/leave-approval/leaveDateFormatting";
import { useAuth } from "@/src/hooks/useAuth";
import { useTheme } from "@/src/hooks/useTheme";
import { toAppError, type AppError } from "@/src/types/errors";

type AccountUiState = "idle" | "confirming_logout" | "logging_out";

/**
 * Account (Prompt 11) — session information + Logout, reusing the
 * CANONICAL authentication infrastructure (`useAuth().signOut()`,
 * Prompt 3) rather than a second logout mechanism. On success, `AuthGate`
 * (unchanged) redirects to `(auth)/welcome` automatically once the session
 * becomes `null` — this screen never navigates there itself, avoiding a
 * duplicate redirect race.
 */
export default function Account() {
  const { theme } = useTheme();
  const { profile } = useProfile();
  const { signOut } = useAuth();
  const [uiState, setUiState] = useState<AccountUiState>("idle");
  const [logoutError, setLogoutError] = useState<AppError | null>(null);

  // See src/components/ui/TextField.tsx's identical fix — `accessibilityRole="alert"`
  // alone is not reliably announced by TalkBack/VoiceOver on this platform.
  useEffect(() => {
    if (logoutError) {
      AccessibilityInfo.announceForAccessibility(logoutError.userMessage);
    }
  }, [logoutError]);

  const handleConfirmLogout = async () => {
    setUiState("logging_out");
    setLogoutError(null);
    try {
      await signOut();
      // AuthGate handles the redirect once the session becomes null.
    } catch (err) {
      setLogoutError(toAppError(err));
      setUiState("confirming_logout");
    }
  };

  return (
    <PageContainer>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <PageHeader title="Account" />

        <SectionHeader title="Session" />
        <Card>
          <DetailRow label="Registered mobile" value={profile.phoneNumber ?? "Not available"} />
          <DetailRow label="Last login" value={formatLeaveDate(profile.lastLoginAt)} />
        </Card>

        <View style={{ marginTop: theme.spacing.lg }}>
          <SectionHeader title="Log out" />
          {uiState === "idle" ? (
            <Button
              label="Log out"
              variant="danger"
              fullWidth
              onPress={() => setUiState("confirming_logout")}
              accessibilityHint="Opens a confirmation before signing you out"
            />
          ) : (
            <ConfirmationPanel
              title="Log out of DigiHostel?"
              tone="danger"
              confirmLabel={uiState === "logging_out" ? "Logging out…" : "Log out"}
              onCancel={() => setUiState("idle")}
              onConfirm={handleConfirmLogout}
              disabled={uiState === "logging_out"}
              bullets={[
                "You'll need to verify with a one-time code to sign in again.",
                "This only signs you out on this device.",
              ]}
            />
          )}
          {logoutError ? (
            <Text
              accessibilityRole="alert"
              style={{ color: theme.colors.error, fontSize: 13, marginTop: theme.spacing.sm }}
            >
              {logoutError.userMessage}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 32 },
});
