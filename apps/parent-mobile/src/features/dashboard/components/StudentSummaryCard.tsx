import { StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../../contexts/ThemeContext";
import { Card } from "../../../components/ui/Card";
import { SectionHeader } from "../../../components/ui/SectionHeader";
import { EmptyState } from "../../../components/feedback/EmptyState";
import { STUDENT_SUMMARY_UNAVAILABLE } from "../dashboardContent";

/** Prepared shape for a future linked-student summary — not populated by
 * anything in this prompt. No `services/students` (or equivalent) exists in
 * this app, and no `/api/v1/profile`-family route is implemented yet
 * (docs/api-contract.md) — inventing a fetch against a non-existent endpoint
 * would violate this prompt's own "do not invent backend APIs" boundary.
 * This interface exists so a future prompt can wire real data into this
 * exact component without a redesign. */
export interface StudentSummary {
  id: string;
  name: string;
  rollNumber: string;
  hostel: string;
  room: string;
}

export interface StudentSummaryCardProps {
  /** `undefined` (the only value ever passed today) renders the honest
   * "unavailable" state below — never a loading spinner, since there is no
   * async source to wait on yet, and never a fabricated placeholder record. */
  student?: StudentSummary;
}

export function StudentSummaryCard({ student }: StudentSummaryCardProps) {
  const { theme } = useThemeContext();

  return (
    <View style={{ marginTop: theme.spacing.lg }}>
      <SectionHeader title="Student" />
      {student ? (
        <Card>
          <Text style={[styles.name, { color: theme.colors.textPrimary }]}>{student.name}</Text>
          <Text style={[styles.detail, { color: theme.colors.textSecondary, marginTop: 4 }]}>
            Roll no. {student.rollNumber} · {student.hostel}, Room {student.room}
          </Text>
        </Card>
      ) : (
        <Card>
          <EmptyState
            title={STUDENT_SUMMARY_UNAVAILABLE.title}
            description={STUDENT_SUMMARY_UNAVAILABLE.description}
          />
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 16, fontWeight: "600" },
  detail: { fontSize: 13 },
});
