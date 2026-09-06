import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../../contexts/ThemeContext";
import { Badge } from "../../../components/ui/Badge";
import { Card } from "../../../components/ui/Card";
import {
  CATEGORY_LABELS,
  DELIVERY_STATUS_LABELS,
  isActionable,
} from "../notificationClassification";
import { formatNotificationTimestamp } from "../notificationFormatting";
import type { ParentNotification } from "../notificationTypes";

export interface NotificationCardProps {
  notification: ParentNotification;
  onPress: () => void;
}

/**
 * Reusable notification card (Prompt 8). Never renders `notification.id` or
 * `relatedLeaveRequestId` (this prompt's explicit "no internal identifiers"
 * rule) — only title/description/category/priority/timestamp/delivery
 * status, all real fields (see `notificationTypes.ts`).
 *
 * No unread/read visual distinction: every notification is genuinely
 * unread today (no read-state persistence exists —
 * `notificationClassification.ts`'s `isUnread` doc comment), so a
 * "some cards look read, some don't" treatment would fabricate a
 * distinction this app cannot make; every title renders with the same
 * (bold) weight instead.
 *
 * High-priority notifications (leave approvals) get a left accent border —
 * the same visual language `PendingActionsCard`/`SecurityStatusCard`
 * already use (`docs/foundation.md` §13) — plus an explicit "High priority"
 * badge, never color alone.
 */
export function NotificationCard({ notification, onPress }: NotificationCardProps) {
  const { theme } = useThemeContext();
  const isHighPriority = notification.priority === "high";
  const actionable = isActionable(notification);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={notification.title}
      accessibilityHint={
        actionable
          ? "Opens notification details"
          : "Opens notification details, no action available"
      }
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Card
        style={[
          styles.card,
          isHighPriority ? { borderLeftWidth: 3, borderLeftColor: theme.colors.warning } : null,
        ]}
      >
        <View style={styles.headerRow}>
          <Badge
            label={CATEGORY_LABELS[notification.category]}
            tone={isHighPriority ? "warning" : "neutral"}
          />
          {isHighPriority ? <Badge label="High priority" tone="warning" /> : null}
        </View>
        <Text
          style={[styles.title, { color: theme.colors.textPrimary, marginTop: theme.spacing.xs }]}
        >
          {notification.title}
        </Text>
        <Text style={[styles.description, { color: theme.colors.textSecondary, marginTop: 2 }]}>
          {notification.description}
        </Text>
        <View style={[styles.footerRow, { marginTop: theme.spacing.sm }]}>
          <Text style={[styles.timestamp, { color: theme.colors.textDisabled }]}>
            {formatNotificationTimestamp(notification.createdAt)}
          </Text>
          {notification.deliveryStatus === "failed" ? (
            <Text style={[styles.deliveryIssue, { color: theme.colors.error }]}>
              {DELIVERY_STATUS_LABELS.failed}
            </Text>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 44 },
  headerRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  title: { fontSize: 15, fontWeight: "700" },
  description: { fontSize: 13, lineHeight: 18 },
  footerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  timestamp: { fontSize: 12 },
  deliveryIssue: { fontSize: 12, fontWeight: "600" },
});
