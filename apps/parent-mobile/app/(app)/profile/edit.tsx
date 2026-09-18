import { useEffect, useState } from "react";
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View } from "react-native";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { TextField } from "@/src/components/ui/TextField";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { DetailRow } from "@/src/components/ui/DetailRow";
import { SectionHeader } from "@/src/components/ui/SectionHeader";
import { Loader } from "@/src/components/feedback/Loader";
import { ErrorState } from "@/src/components/feedback/ErrorState";
import { useProfile } from "@/src/features/profile/hooks/useProfile";
import { useTheme } from "@/src/hooks/useTheme";

/**
 * Edit Profile (Prompt 11). Only `fullName` is editable — a REAL mutation
 * (`profileService.updateParentProfile()`, `parents_update_own` RLS grant),
 * not a fake save. `phoneNumber` is read-only: it's the field ADR-020's
 * OTP-recipient lookup matches against (`services/supabase/auth.ts`'s own
 * doc comment), so editing it here would have an authentication-identity
 * implication beyond ordinary profile display data — out of this prompt's
 * "do not modify authentication identity ownership without explicit
 * architectural support" boundary. See `docs/profile.md`'s capability
 * matrix for the full reasoning.
 */
export default function EditProfile() {
  const { theme } = useTheme();
  const {
    profile,
    isLoading,
    error,
    refresh,
    updateProfile,
    isUpdating,
    updateError,
    resetUpdateState,
  } = useProfile();
  const [name, setName] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const currentName = name ?? profile.name ?? "";
  const isUnchanged = currentName.trim() === (profile.name ?? "").trim();

  // See src/components/ui/TextField.tsx's identical fix — `accessibilityRole="alert"`
  // alone is not reliably announced by TalkBack/VoiceOver on this platform.
  useEffect(() => {
    if (updateError) {
      AccessibilityInfo.announceForAccessibility(updateError.userMessage);
    }
  }, [updateError]);

  const handleSave = () => {
    setSaved(false);
    updateProfile(currentName)
      .then(() => setSaved(true))
      .catch(() => {
        // updateError already carries the mapped, safe message.
      });
  };

  if (isLoading && !profile.name) {
    return (
      <PageContainer>
        <Loader fullPage />
      </PageContainer>
    );
  }

  if (error && !profile.name) {
    return (
      <PageContainer>
        <ErrorState error={error} onRetry={refresh} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <PageHeader title="Edit Profile" subtitle="Only your name can be changed here." />

        <SectionHeader title="Name" />
        <TextField
          label="Full name"
          value={currentName}
          onChangeText={(value) => {
            setName(value);
            setSaved(false);
            resetUpdateState();
          }}
          accessibilityHint="Your name as shown across the app"
        />

        {updateError ? (
          <Text
            accessibilityRole="alert"
            style={{ color: theme.colors.error, fontSize: 13, marginTop: theme.spacing.xs }}
          >
            {updateError.userMessage}
          </Text>
        ) : null}
        {saved && !isUpdating ? (
          <Text
            accessibilityRole="text"
            accessibilityLiveRegion="polite"
            style={{ color: theme.colors.success, fontSize: 13, marginTop: theme.spacing.xs }}
          >
            Saved
          </Text>
        ) : null}

        <View style={{ marginTop: theme.spacing.md }}>
          <Button
            label="Save changes"
            fullWidth
            loading={isUpdating}
            disabled={isUnchanged || currentName.trim().length === 0}
            onPress={handleSave}
          />
        </View>

        <View style={{ marginTop: theme.spacing.lg }}>
          <SectionHeader
            title="Read-only information"
            subtitle="These fields can't be changed from the app yet."
          />
          <Card>
            <DetailRow label="Registered mobile" value={profile.phoneNumber ?? "Not available"} />
          </Card>
        </View>
      </ScrollView>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 32 },
});
