import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../../contexts/ThemeContext";
import { Card } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { relationshipLabel } from "../profilePresentationMapper";
import type { LinkedStudentSummary } from "../types";

export interface LinkedStudentCardProps {
  summary: LinkedStudentSummary;
  onPress: () => void;
}

/**
 * Linked Student summary card (Prompt 11) — never renders `student.id`.
 * `pendingCount`/`recentActivityCount` come from `useLinkedStudents()`'s
 * reuse of the existing leave-approval data (no second leave-data source —
 * see that hook's own doc comment).
 */
export function LinkedStudentCard({ summary, onPress }: LinkedStudentCardProps) {
  const { theme } = useThemeContext();
  const { student, pendingCount, recentActivityCount } = summary;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${student.name}, ${relationshipLabel(student.relationship)}`}
      accessibilityHint="Opens this student's details"
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={[styles.name, { color: theme.colors.textPrimary }]}>{student.name}</Text>
          <Badge label={relationshipLabel(student.relationship)} tone="primary" />
        </View>
        <Text
          style={[
            styles.detail,
            { color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
          ]}
        >
          Roll no. {student.rollNumber}
          {student.hostel ? ` · ${student.hostel}` : ""}
          {student.room ? `, Room ${student.room}` : ""}
        </Text>
        {pendingCount > 0 ? (
          <View style={{ marginTop: theme.spacing.sm, alignSelf: "flex-start" }}>
            <Badge
              label={pendingCount === 1 ? "1 pending request" : `${pendingCount} pending requests`}
              tone="warning"
            />
          </View>
        ) : recentActivityCount === 0 ? (
          <Text
            style={[
              styles.noActivity,
              { color: theme.colors.textDisabled, marginTop: theme.spacing.sm },
            ]}
          >
            No leave activity yet
          </Text>
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
  name: { fontSize: 15, fontWeight: "700", flexShrink: 1 },
  detail: { fontSize: 13 },
  noActivity: { fontSize: 12 },
});
