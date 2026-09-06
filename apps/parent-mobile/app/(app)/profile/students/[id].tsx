import { ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { Card } from "@/src/components/ui/Card";
import { Badge } from "@/src/components/ui/Badge";
import { Button } from "@/src/components/ui/Button";
import { DetailRow } from "@/src/components/ui/DetailRow";
import { SectionHeader } from "@/src/components/ui/SectionHeader";
import { Loader } from "@/src/components/feedback/Loader";
import { EmptyState } from "@/src/components/feedback/EmptyState";
import { ErrorState } from "@/src/components/feedback/ErrorState";
import { useLinkedStudents } from "@/src/features/profile/hooks/useLinkedStudents";
import { relationshipLabel } from "@/src/features/profile/profilePresentationMapper";
import { leaveStatusTone } from "@/src/features/leave-approval/leaveStatusFormatter";
import { useTheme } from "@/src/hooks/useTheme";

/**
 * Linked Student Details (Prompt 11) — read-only. Fields shown are exactly
 * what `profileService.listLinkedStudents()` can supply (name, roll
 * number, hostel, room, relationship) plus a leave-activity list reused
 * from the SAME `usePendingApprovals()` data `useLinkedStudents()` already
 * merges in — no second leave-data source, no student-relationship
 * mutation (no backend endpoint supports one — see `docs/profile.md`'s
 * capability matrix). `department`/`programme`/`year` are never shown:
 * `students` has no such columns (`packages/db/src/schema/identity.ts`),
 * so this screen doesn't invent placeholders for them.
 */
export default function LinkedStudentDetails() {
  const { theme } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { students, isLoading, error, refresh } = useLinkedStudents();

  const summary = students.find((entry) => entry.student.id === id);

  if (isLoading && !summary) {
    return (
      <PageContainer>
        <Loader fullPage />
      </PageContainer>
    );
  }

  if (error && !summary) {
    return (
      <PageContainer>
        <ErrorState error={error} onRetry={refresh} />
      </PageContainer>
    );
  }

  if (!summary) {
    return (
      <PageContainer>
        <PageHeader title="Student" />
        <EmptyState
          title="This student isn't available"
          description="It may no longer be linked to your account."
        />
      </PageContainer>
    );
  }

  const { student, pendingCount, recentActivityCount } = summary;

  return (
    <PageContainer>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <PageHeader title={student.name} subtitle={relationshipLabel(student.relationship)} />

        <Card>
          <DetailRow label="Roll number" value={student.rollNumber} />
          <DetailRow label="Hostel" value={student.hostel ?? "Not available"} />
          <DetailRow label="Room" value={student.room ?? "Not available"} />
          <DetailRow label="Relationship" value={relationshipLabel(student.relationship)} />
        </Card>

        <View style={{ marginTop: theme.spacing.lg }}>
          <SectionHeader title="Leave activity" />
          <Card>
            {recentActivityCount === 0 ? (
              <EmptyState
                title="No leave activity yet"
                description="Leave requests for this student will appear here."
              />
            ) : (
              <>
                <DetailRow
                  label="Pending approval"
                  value={
                    <Badge
                      label={pendingCount > 0 ? `${pendingCount}` : "None"}
                      tone={pendingCount > 0 ? leaveStatusTone("awaiting_response") : "neutral"}
                    />
                  }
                />
                <DetailRow label="Total requests on record" value={`${recentActivityCount}`} />
              </>
            )}
          </Card>
        </View>

        <View style={{ marginTop: theme.spacing.lg }}>
          <Button
            label="View approval history"
            variant="secondary"
            fullWidth
            onPress={() => router.push("/(app)/(tabs)/history")}
            accessibilityHint="Opens the Approval History tab"
          />
        </View>
      </ScrollView>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 32 },
});
