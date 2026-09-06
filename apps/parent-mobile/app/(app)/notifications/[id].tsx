import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { Card } from "@/src/components/ui/Card";
import { Badge } from "@/src/components/ui/Badge";
import { Button } from "@/src/components/ui/Button";
import { Divider } from "@/src/components/ui/Divider";
import { Loader } from "@/src/components/feedback/Loader";
import { EmptyState } from "@/src/components/feedback/EmptyState";
import { ErrorState } from "@/src/components/feedback/ErrorState";
import {
  CATEGORY_LABELS,
  DELIVERY_STATUS_LABELS,
  isActionable,
} from "@/src/features/notifications/notificationClassification";
import { formatNotificationTimestamp } from "@/src/features/notifications/notificationFormatting";
import { useNotificationCenter } from "@/src/hooks/useNotificationCenter";
import { useTheme } from "@/src/hooks/useTheme";

/**
 * Notification Details (Prompt 8). Looks the notification up from
 * `allNotifications` — the SAME cached, RLS-scoped list the Notification
 * Center already fetched (TanStack Query dedupes the identical query key,
 * so this issues no extra network request in the common case of navigating
 * from the list; a direct deep link fetches once, same as any other screen
 * reading this hook).
 *
 * Deliberately does NOT fetch the related leave request's own details
 * (reason/dates/live status) via `useGetLeaveRequest` — even though that
 * generated hook exists and is real — because doing so is leave-approval
 * business logic this prompt's own scope_guard excludes; see
 * `docs/notifications.md`'s capability matrix. "Open request" below
 * deep-links to the existing (still-placeholder) `leave/[id]` route without
 * inventing that screen's content.
 *
 * "Related student information," "timeline information," and "attachment"
 * — all named in this prompt's `<notification_details>` list — are shown as
 * truthful unavailable/empty states, not fabricated: no student name is
 * available anywhere in this app (see `notificationContent.ts`), no richer
 * timeline can be shown without exposing internal escalation stage detail
 * (explicitly forbidden), and no attachment mechanism exists in this
 * backend at all.
 */
export default function NotificationDetails() {
  const { theme } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { allNotifications, isLoading, error, refresh, performAction, actionError } =
    useNotificationCenter();

  const notification = useMemo(
    () => allNotifications.find((n) => n.id === id),
    [allNotifications, id],
  );

  if (isLoading && !notification) {
    return (
      <PageContainer>
        <Loader fullPage />
      </PageContainer>
    );
  }

  if (error && !notification) {
    return (
      <PageContainer>
        <ErrorState error={error} onRetry={refresh} />
      </PageContainer>
    );
  }

  if (!notification) {
    return (
      <PageContainer>
        <PageHeader title="Notification" />
        <EmptyState
          title="This notification isn't available"
          description="It may have expired, or the link may be out of date."
          actionLabel="Refresh"
          onAction={refresh}
        />
      </PageContainer>
    );
  }

  const actionable = isActionable(notification);
  const isHighPriority = notification.priority === "high";

  const handleAction = (kind: "markAsRead" | "delete" | "archive") => {
    performAction({ kind, notificationId: notification.id }).catch(() => {
      // actionError already carries the mapped, safe message.
    });
  };

  return (
    <PageContainer>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <PageHeader title="Notification" />

        <View style={styles.badgeRow}>
          <Badge
            label={CATEGORY_LABELS[notification.category]}
            tone={isHighPriority ? "warning" : "neutral"}
          />
          {isHighPriority ? <Badge label="High priority" tone="warning" /> : null}
        </View>

        <Text
          style={[styles.title, { color: theme.colors.textPrimary, marginTop: theme.spacing.sm }]}
        >
          {notification.title}
        </Text>
        <Text
          style={[
            styles.description,
            { color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
          ]}
        >
          {notification.description}
        </Text>

        <Card style={{ marginTop: theme.spacing.lg }}>
          <DetailRow label="Received" value={formatNotificationTimestamp(notification.createdAt)} />
          <Divider />
          <DetailRow
            label="Delivery status"
            value={DELIVERY_STATUS_LABELS[notification.deliveryStatus]}
          />
          <Divider />
          <DetailRow label="Related student" value="Not available in this app yet" />
          <Divider />
          <DetailRow label="Attachments" value="None" />
        </Card>

        {actionable ? (
          <View style={{ marginTop: theme.spacing.lg }}>
            <Button
              label="Open leave request"
              fullWidth
              onPress={() =>
                router.push({
                  pathname: "/(app)/leave/[id]",
                  params: { id: notification.relatedLeaveRequestId! },
                })
              }
              accessibilityHint="Opens the leave request this notification is about"
            />
          </View>
        ) : null}

        <View style={{ marginTop: theme.spacing.lg, gap: 8 }}>
          <Button
            label="Mark as read"
            variant="secondary"
            onPress={() => handleAction("markAsRead")}
            accessibilityHint="Not available yet"
          />
          <Button
            label="Archive"
            variant="secondary"
            onPress={() => handleAction("archive")}
            accessibilityHint="Not available yet"
          />
          <Button
            label="Delete"
            variant="ghost"
            onPress={() => handleAction("delete")}
            accessibilityHint="Not available yet"
          />
        </View>

        {actionError ? (
          <Text
            accessibilityRole="alert"
            style={{ color: theme.colors.error, fontSize: 13, marginTop: theme.spacing.sm }}
          >
            {actionError.userMessage}
          </Text>
        ) : null}
      </ScrollView>
    </PageContainer>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: theme.colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 32 },
  badgeRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  title: { fontSize: 20, fontWeight: "700" },
  description: { fontSize: 14, lineHeight: 20 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, gap: 12 },
  detailLabel: { fontSize: 13 },
  detailValue: { fontSize: 13, fontWeight: "600", flexShrink: 1, textAlign: "right" },
});
