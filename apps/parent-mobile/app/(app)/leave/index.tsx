import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { Loader } from "@/src/components/feedback/Loader";
import { EmptyState } from "@/src/components/feedback/EmptyState";
import { ErrorState } from "@/src/components/feedback/ErrorState";
import { LeaveRequestCard } from "@/src/features/leave-approval/components/LeaveRequestCard";
import { usePendingApprovals } from "@/src/features/leave-approval/hooks/usePendingApprovals";
import { useTheme } from "@/src/hooks/useTheme";
import { useLeaveRequestRealtime } from "@/src/hooks/useLeaveRequestRealtime";
import type { LeaveRequestPresentation } from "@/src/features/leave-approval/types";

/**
 * Pending Approval (Prompt 9A presentation; Prompt 9B backend integration)
 * — real list via `usePendingApprovals()`, which now calls the real,
 * parent-scoped `GET /leave-requests` (`approvalService.listForCurrentParent()`,
 * wired in Prompt 9B). No client-side filter is applied — `GET
 * /leave-requests` is already scoped server-side to every student linked to
 * the authenticated parent (G-05, `apps/api/src/routes/leave.ts`).
 *
 * `useLeaveRequestRealtime` (no filter — RLS scopes visibility, same
 * reasoning as `useNotificationRealtime`) invalidates this list whenever
 * any visible leave request changes, so a decision made elsewhere (another
 * linked parent, or this same parent on another device) is reflected
 * without requiring a manual pull-to-refresh.
 *
 * DEV-ONLY: when `__DEV__`, a small panel links to
 * `src/features/leave-approval/devFixtures.ts`'s fixture ids so every other
 * built presentation state (approved/rejected/expired/awaiting response) is
 * reachable without a real backend — see that file's own isolation doc
 * comment for why this can never reach a production build.
 */
export default function PendingApproval() {
  const { theme } = useTheme();
  const router = useRouter();
  const { leaveRequests, isLoading, isRefreshing, error, refresh } = usePendingApprovals();
  useLeaveRequestRealtime(refresh);

  const openDetails = (leaveRequest: LeaveRequestPresentation) => {
    router.push({ pathname: "/(app)/leave/[id]", params: { id: leaveRequest.id } });
  };

  if (isLoading && leaveRequests.length === 0 && !error) {
    return (
      <PageContainer>
        <Loader fullPage />
      </PageContainer>
    );
  }

  if (error && leaveRequests.length === 0) {
    return (
      <PageContainer>
        <ErrorState error={error} onRetry={refresh} />
        {__DEV__ ? <DevFixtureLinks /> : null}
      </PageContainer>
    );
  }

  return (
    <PageContainer edges={["bottom", "left", "right"]}>
      <FlatList
        data={leaveRequests}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <LeaveRequestCard leaveRequest={item} onPress={() => openDetails(item)} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
        contentContainerStyle={
          leaveRequests.length === 0 ? styles.emptyContainer : styles.listContent
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
          />
        }
        ListHeaderComponent={__DEV__ ? <DevFixtureLinks /> : null}
        ListEmptyComponent={
          <EmptyState
            title="No pending approvals"
            description="Leave requests awaiting your response will appear here."
          />
        }
      />
    </PageContainer>
  );
}

/** Dev-only navigation shortcuts — see this file's own doc comment and
 * `devFixtures.ts`'s isolation guarantees. */
function DevFixtureLinks() {
  const { theme } = useTheme();
  const router = useRouter();
  const fixtureIds = [
    "dev-awaiting",
    "dev-approved",
    "dev-rejected",
    "dev-expired",
    "dev-with-countdown",
  ];

  return (
    <View
      style={{
        marginBottom: theme.spacing.md,
        padding: theme.spacing.sm,
        borderRadius: theme.radii.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        gap: 6,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: "700", color: theme.colors.textSecondary }}>
        DEV ONLY — preview fixtures
      </Text>
      {fixtureIds.map((id) => (
        <Text
          key={id}
          onPress={() => router.push({ pathname: "/(app)/leave/[id]", params: { id } })}
          style={{ fontSize: 13, color: theme.colors.primary }}
        >
          {id}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingTop: 12, paddingBottom: 24 },
  emptyContainer: { flexGrow: 1, justifyContent: "center" },
});
