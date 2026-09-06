import { View } from "react-native";
import { useThemeContext } from "../../../contexts/ThemeContext";
import { Card } from "../../../components/ui/Card";
import { SectionHeader } from "../../../components/ui/SectionHeader";
import { EmptyState } from "../../../components/feedback/EmptyState";
import { DetailRow } from "../../../components/ui/DetailRow";
import type { StudentPresentation } from "../types";

export interface StudentInformationSectionProps {
  student: StudentPresentation | null;
}

/**
 * Student Information section (Prompt 9A). `student` is `null` for every
 * real request today — no student data source is wired into the Parent
 * Mobile app yet (unchanged from `docs/foundation.md` §13's Student Summary
 * boundary), even though `students_select_linked_parent` RLS genuinely
 * supports a parent reading their linked student's name/roll
 * number/hostel/room (`packages/db/src/schema/identity.ts`) — see
 * `docs/leave-approval.md`'s capability matrix for why that real capability
 * is deliberately not wired here (a direct Supabase read is explicitly out
 * of this presentation-only prompt's scope). This renders a polished,
 * honest "unavailable" state instead of a fake student record.
 *
 * A parent-relationship field and a photograph slot are two more fields
 * this prompt names as "potential" — neither has ANY backend
 * representation at all (no `parent_student_relationships.relationship_type`
 * is exposed to the Parent app anywhere, and no student photo column
 * exists), so they are not modeled here even as always-null fields.
 */
export function StudentInformationSection({ student }: StudentInformationSectionProps) {
  const { theme } = useThemeContext();

  return (
    <View style={{ marginTop: theme.spacing.lg }}>
      <SectionHeader title="Student" />
      {student ? (
        <Card>
          <DetailRow label="Name" value={student.name ?? "Not available"} />
          <DetailRow label="Roll number" value={student.rollNumber ?? "Not available"} />
          <DetailRow label="Hostel" value={student.hostel ?? "Not available"} />
          <DetailRow label="Room" value={student.room ?? "Not available"} />
        </Card>
      ) : (
        <Card>
          <EmptyState
            title="Student details aren't available yet"
            description="This app can't show the linked student's details yet. This will appear here once that capability is added."
          />
        </Card>
      )}
    </View>
  );
}
