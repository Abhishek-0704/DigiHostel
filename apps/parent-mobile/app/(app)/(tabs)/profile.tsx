import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { SectionHeader } from "@/src/components/ui/SectionHeader";
import { Button } from "@/src/components/ui/Button";
import { Skeleton } from "@/src/components/feedback/Skeleton";
import { ErrorState } from "@/src/components/feedback/ErrorState";
import { EmptyState } from "@/src/components/feedback/EmptyState";
import { ProfileHeader } from "@/src/features/profile/components/ProfileHeader";
import { ProfileInformationCard } from "@/src/features/profile/components/ProfileInformationCard";
import { LinkedStudentCard } from "@/src/features/profile/components/LinkedStudentCard";
import { useProfile } from "@/src/features/profile/hooks/useProfile";
import { useLinkedStudents } from "@/src/features/profile/hooks/useLinkedStudents";
import { useDevice } from "@/src/hooks/useDevice";
import { getDeviceTrustState } from "@/src/features/devices/deviceStatus";
import { useTheme } from "@/src/hooks/useTheme";

/**
 * Profile Home (Prompt 11). `useProfile()` reads the real `parents` row
 * (RLS-scoped) plus the already-loaded Supabase Auth session — no fetch
 * this screen doesn't already need elsewhere. "Verified device" reuses
 * `useDevice()`'s real trusted-device state (Prompt 3/6) rather than
 * inventing a new verification concept or duplicating that state.
 *
 * Linked students reuse `usePendingApprovals()`'s already-fetched leave
 * data for their activity summary (`useLinkedStudents()`'s own doc
 * comment) — no second leave-data source.
 */
export default function ProfileHome() {
  const { theme } = useTheme();
  const router = useRouter();
  const {
    profile,
    isLoading: isLoadingProfile,
    isRefreshing: isRefreshingProfile,
    error: profileError,
    refresh: refreshProfile,
  } = useProfile();
  const {
    students,
    isLoading: isLoadingStudents,
    isRefreshing: isRefreshingStudents,
    error: studentsError,
    refresh: refreshStudents,
  } = useLinkedStudents();
  const { devices, isLoading: isLoadingDevices } = useDevice();

  const isVerified = devices.some((device) => getDeviceTrustState(device) === "active");
  const isLoading = isLoadingProfile && !profile.name;

  const handleRefresh = async () => {
    await Promise.all([refreshProfile(), refreshStudents()]);
  };

  if (isLoading) {
    return (
      <PageContainer edges={["top", "left", "right"]}>
        <PageHeader title="Profile" />
        <View style={{ gap: theme.spacing.sm }}>
          <Skeleton height={80} />
          <Skeleton height={140} />
          <Skeleton height={100} />
        </View>
      </PageContainer>
    );
  }

  if (profileError && !profile.name) {
    return (
      <PageContainer edges={["top", "left", "right"]}>
        <PageHeader title="Profile" />
        <ErrorState error={profileError} onRetry={refreshProfile} />
      </PageContainer>
    );
  }

  return (
    <PageContainer edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshingProfile || isRefreshingStudents}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        <PageHeader title="Profile" />

        <ProfileHeader
          name={profile.name}
          verified={isVerified}
          isLoadingVerification={isLoadingDevices}
        />
        <ProfileInformationCard profile={profile} />

        <View style={{ marginTop: theme.spacing.sm }}>
          <Button
            label="Edit profile"
            variant="secondary"
            onPress={() => router.push("/(app)/profile/edit")}
            accessibilityHint="Opens editable profile fields"
          />
        </View>

        <View style={{ marginTop: theme.spacing.lg }}>
          <SectionHeader title="Linked students" />
          {isLoadingStudents && students.length === 0 ? (
            <View style={{ gap: theme.spacing.sm }}>
              <Skeleton height={90} />
            </View>
          ) : studentsError && students.length === 0 ? (
            <ErrorState error={studentsError} onRetry={refreshStudents} />
          ) : students.length === 0 ? (
            <EmptyState
              title="No linked students"
              description="Students linked to your account will appear here."
            />
          ) : (
            <View style={{ gap: theme.spacing.sm }}>
              {students.map((summary) => (
                <LinkedStudentCard
                  key={summary.student.id}
                  summary={summary}
                  onPress={() =>
                    router.push({
                      pathname: "/(app)/profile/students/[id]",
                      params: { id: summary.student.id },
                    })
                  }
                />
              ))}
            </View>
          )}
        </View>

        <View style={{ marginTop: theme.spacing.lg, gap: 8 }}>
          <SectionHeader title="Quick links" />
          <Button
            label="Security Center"
            variant="secondary"
            fullWidth
            onPress={() => router.push("/(app)/security")}
            accessibilityHint="Opens trusted devices and biometric settings"
          />
          <Button
            label="Approval history"
            variant="secondary"
            fullWidth
            onPress={() => router.push("/(app)/(tabs)/history")}
            accessibilityHint="Opens the Approval History tab"
          />
          <Button
            label="Help & Support"
            variant="secondary"
            fullWidth
            onPress={() => router.push("/(app)/help")}
            accessibilityHint="Opens help and support"
          />
          <Button
            label="Settings"
            variant="ghost"
            fullWidth
            onPress={() => router.push("/(app)/settings")}
            accessibilityHint="Opens application settings"
          />
        </View>
      </ScrollView>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 32 },
});
