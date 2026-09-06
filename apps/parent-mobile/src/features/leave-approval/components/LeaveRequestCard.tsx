import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../../contexts/ThemeContext";
import { Card } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { leaveStatusLabel, leaveStatusTone } from "../leaveStatusFormatter";
import { formatLeaveDate } from "../leaveDateFormatting";
import { CountdownTimer } from "./CountdownTimer";
import type { LeaveRequestPresentation } from "../types";

export interface LeaveRequestCardProps {
  leaveRequest: LeaveRequestPresentation;
  onPress: () => void;
}

/**
 * Reusable Leave Request Card (Prompt 9A) — for the Pending Approval list.
 * Never renders `leaveRequest.id` as visible text (opaque nav param only —
 * this prompt's explicit "no internal identifiers" rule). Shows a student
 * name only when `leaveRequest.student` is populated (always `null` today —
 * see `leavePresentationMapper.ts`'s doc comment); otherwise a generic
 * "Linked student" label, never a fabricated name.
 */
export function LeaveRequestCard({ leaveRequest, onPress }: LeaveRequestCardProps) {
  const { theme } = useThemeContext();
  const studentLabel = leaveRequest.student?.name ?? "Linked student";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${studentLabel} — ${leaveStatusLabel(leaveRequest.status)}`}
      accessibilityHint="Opens leave request details"
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={[styles.studentName, { color: theme.colors.textPrimary }]}>
            {studentLabel}
          </Text>
          <Badge
            label={leaveStatusLabel(leaveRequest.status)}
            tone={leaveStatusTone(leaveRequest.status)}
          />
        </View>
        {leaveRequest.reason ? (
          <Text
            style={[
              styles.reason,
              { color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
            ]}
            numberOfLines={2}
          >
            {leaveRequest.reason}
          </Text>
        ) : null}
        <Text
          style={[styles.dates, { color: theme.colors.textDisabled, marginTop: theme.spacing.xs }]}
        >
          {formatLeaveDate(leaveRequest.departureDate)} –{" "}
          {formatLeaveDate(leaveRequest.expectedReturnDate)}
        </Text>
        {leaveRequest.expiryTimestamp ? (
          <View style={{ marginTop: theme.spacing.sm }}>
            <CountdownTimer expiryTimestamp={leaveRequest.expiryTimestamp} />
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 44 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  studentName: { fontSize: 15, fontWeight: "700", flexShrink: 1 },
  reason: { fontSize: 13, lineHeight: 18 },
  dates: { fontSize: 12 },
});
