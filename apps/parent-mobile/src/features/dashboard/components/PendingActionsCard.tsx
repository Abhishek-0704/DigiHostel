import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useThemeContext } from "../../../contexts/ThemeContext";
import { Card } from "../../../components/ui/Card";
import { SectionHeader } from "../../../components/ui/SectionHeader";
import { EmptyState } from "../../../components/feedback/EmptyState";
import { Skeleton } from "../../../components/feedback/Skeleton";
import { usePendingApprovals } from "../../leave-approval/hooks/usePendingApprovals";

/** The dashboard's most prominent widget, per this prompt's own
 * `<pending_actions>` instructions. Prompt 9B wires this to the real,
 * already-tested `usePendingApprovals()` (same query/cache
 * `usePendingApprovals`/`useDecideLeaveRequest` on the leave screens use —
 * a decision made from either surface invalidates the same
 * `PENDING_APPROVALS_QUERY_KEY`, so this card and `/(app)/leave` never
 * drift out of sync). Never a fabricated count — `pendingCount` is exactly
 * what the backend's parent-scoped `GET /leave-requests` returned.
 *
 * Placed first among the "real" content sections (after the generic
 * Welcome Header) precisely because it is the section most likely to
 * demand attention; a left-accent border echoes `SecurityStatusCard`'s own
 * "something needs a look" visual language without claiming a status this
 * app cannot verify. */
export function PendingActionsCard() {
  const { theme } = useThemeContext();
  const router = useRouter();
  const { pendingCount, isLoading, error } = usePendingApprovals();

  const goToLeaveList = () => router.push("/(app)/leave");

  return (
    <View style={{ marginTop: theme.spacing.lg }}>
      <SectionHeader title="Pending actions" />
      <Card style={{ borderLeftWidth: 3, borderLeftColor: theme.colors.border }}>
        {isLoading ? (
          <Skeleton height={48} />
        ) : error ? (
          <EmptyState
            title="Pending approvals aren't available right now"
            description="Please try again shortly."
            actionLabel="View leave requests"
            onAction={goToLeaveList}
          />
        ) : pendingCount === 0 ? (
          <EmptyState
            title="No pending approvals"
            description="Leave requests awaiting your response will appear here."
            actionLabel="View leave requests"
            onAction={goToLeaveList}
          />
        ) : (
          <View>
            <Text style={{ fontSize: 15, fontWeight: "600", color: theme.colors.textPrimary }}>
              {pendingCount} leave {pendingCount === 1 ? "request" : "requests"} awaiting your
              response
            </Text>
            <Text
              onPress={goToLeaveList}
              accessibilityRole="button"
              style={{
                marginTop: 4,
                fontSize: 13,
                color: theme.colors.primary,
                fontWeight: "600",
              }}
            >
              View leave requests
            </Text>
          </View>
        )}
      </Card>
    </View>
  );
}
