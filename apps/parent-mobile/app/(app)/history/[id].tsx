import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { OfflineBanner } from "@/src/components/layout/OfflineBanner";
import { Card } from "@/src/components/ui/Card";
import { Button } from "@/src/components/ui/Button";
import { SectionHeader } from "@/src/components/ui/SectionHeader";
import { Skeleton } from "@/src/components/feedback/Skeleton";
import { EmptyState } from "@/src/components/feedback/EmptyState";
import { ErrorState } from "@/src/components/feedback/ErrorState";
import { StudentInformationSection } from "@/src/features/leave-approval/components/StudentInformationSection";
import { LeaveInformationSection } from "@/src/features/leave-approval/components/LeaveInformationSection";
import { LeaveTimeline } from "@/src/features/leave-approval/components/LeaveTimeline";
import { DetailRow } from "@/src/components/ui/DetailRow";
import { formatLeaveDate } from "@/src/features/leave-approval/leaveDateFormatting";
import { useHistoryRecordDetails } from "@/src/features/approval-history/hooks/useHistoryRecordDetails";
import { useHistoryRecordEvents } from "@/src/features/approval-history/hooks/useHistoryRecordEvents";
import { buildTimelineFromEvents } from "@/src/features/approval-history/historyTimeline";
import { useTheme } from "@/src/hooks/useTheme";
import { useLeaveRequestRealtime } from "@/src/hooks/useLeaveRequestRealtime";
import { useLeaveApprovalEventsRealtime } from "@/src/hooks/useLeaveApprovalEventsRealtime";

/**
 * Approval History Detail (Phase 4 Prompt 10) — read-only. Reuses
 * `LeaveInformationSection`/`StudentInformationSection`/`LeaveTimeline`
 * unchanged from Leave Approval (same components, same props contract —
 * `LeaveTimeline` already documented as forward-compatible with a richer,
 * real event-backed timeline, `docs/leave-approval.md` §14).
 *
 * Deliberately renders NO approve/reject action, ever — even for a record
 * that is technically still in a decidable status. History is a read-only
 * record; a still-pending request instead gets a link to the real decision
 * screen (`/(app)/leave/[id]`), never a duplicated decision control here.
 */
export default function ApprovalHistoryDetail() {
  const { theme } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { record, isLoading, error, refresh } = useHistoryRecordDetails(id);
  const {
    events,
    isLoading: eventsLoading,
    error: eventsError,
    refresh: refreshEvents,
  } = useHistoryRecordEvents(id);

  useLeaveRequestRealtime(() => {
    refresh();
    refreshEvents();
  }, `id=eq.${id}`);
  // F-08: the leave_requests subscription above only catches an event
  // insert when it happens to ride along with a status change (true of
  // every event type this backend inserts today, but not guaranteed for
  // every event type the schema defines). Subscribing to
  // leave_approval_events directly closes that gap regardless of whether a
  // future event ever arrives without an accompanying status change.
  useLeaveApprovalEventsRealtime(refreshEvents, `leave_request_id=eq.${id}`);

  if (isLoading) {
    return (
      <PageContainer>
        <PageHeader title="History Record" />
        <View style={{ gap: theme.spacing.sm }}>
          <Skeleton height={80} />
          <Skeleton height={160} />
          <Skeleton height={120} />
        </View>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <PageHeader title="History Record" />
        <ErrorState error={error} onRetry={refresh} />
      </PageContainer>
    );
  }

  if (!record) {
    return (
      <PageContainer>
        <PageHeader title="History Record" />
        <EmptyState title="This record isn't available" description="It may no longer exist." />
      </PageContainer>
    );
  }

  const timelineEvents = eventsLoading
    ? null
    : buildTimelineFromEvents(events, record.requestedAt, record.status);

  return (
    <PageContainer>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <PageHeader title="History Record" />
        <OfflineBanner />

        <StudentInformationSection student={record.student} />
        <LeaveInformationSection leaveRequest={record} />

        <View style={{ marginTop: theme.spacing.lg }}>
          <Card>
            <DetailRow label="Requested" value={formatLeaveDate(record.requestedAt)} />
            <DetailRow
              label="Decided"
              value={record.decidedAt ? formatLeaveDate(record.decidedAt) : "Not decided yet"}
            />
          </Card>
        </View>

        <View style={{ marginTop: theme.spacing.lg }}>
          <SectionHeader title="Timeline" />
          <View style={{ marginTop: theme.spacing.sm }}>
            {eventsLoading ? (
              <Skeleton height={120} />
            ) : eventsError ? (
              <ErrorState error={eventsError} onRetry={refreshEvents} />
            ) : (
              <LeaveTimeline events={timelineEvents} />
            )}
          </View>
        </View>

        {record.status === "awaiting_response" ? (
          <View style={{ marginTop: theme.spacing.lg, gap: 8 }}>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 13 }}>
              This request is still awaiting your decision.
            </Text>
            <Button
              label="Go to pending approval"
              fullWidth
              onPress={() => router.push({ pathname: "/(app)/leave/[id]", params: { id } })}
            />
          </View>
        ) : null}
      </ScrollView>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 32 },
});
