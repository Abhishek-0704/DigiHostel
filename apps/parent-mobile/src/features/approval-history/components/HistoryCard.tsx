import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../../contexts/ThemeContext";
import { Card } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { leaveStatusLabel, leaveStatusTone, formatLeaveDate } from "../../leave-approval";
import type { HistoryRecordPresentation } from "../historyPresentationMapper";

export interface HistoryCardProps {
  record: HistoryRecordPresentation;
  onPress: () => void;
}

/**
 * Approval History card (Phase 4 Prompt 10) — mirrors `LeaveRequestCard`'s
 * visual language exactly (same `Card`/`Badge` composition), extended with a
 * "Decided" row shown only when `decidedAt` is real (terminal-status
 * records only — see `historyPresentationMapper.ts`). Never renders
 * `record.id` as visible text — opaque navigation key only.
 */
export function HistoryCard({ record, onPress }: HistoryCardProps) {
  const { theme } = useThemeContext();
  const studentLabel = record.student?.name ?? "Linked student";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${studentLabel} — ${leaveStatusLabel(record.status)}`}
      accessibilityHint="Opens the full approval history record"
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={[styles.studentName, { color: theme.colors.textPrimary }]}>
            {studentLabel}
          </Text>
          <Badge label={leaveStatusLabel(record.status)} tone={leaveStatusTone(record.status)} />
        </View>
        {record.reason ? (
          <Text
            style={[
              styles.reason,
              { color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
            ]}
            numberOfLines={2}
          >
            {record.reason}
          </Text>
        ) : null}
        <Text
          style={[styles.dates, { color: theme.colors.textDisabled, marginTop: theme.spacing.xs }]}
        >
          {formatLeaveDate(record.departureDate)} – {formatLeaveDate(record.expectedReturnDate)}
        </Text>
        <Text
          style={[styles.dates, { color: theme.colors.textDisabled, marginTop: theme.spacing.xs }]}
        >
          Requested {formatLeaveDate(record.requestedAt)}
          {record.decidedAt ? ` · Decided ${formatLeaveDate(record.decidedAt)}` : ""}
        </Text>
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
