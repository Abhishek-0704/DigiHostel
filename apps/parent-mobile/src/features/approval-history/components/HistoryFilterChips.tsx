import { ScrollView, StyleSheet } from "react-native";
import { SelectableChip } from "../../../components/ui/SelectableChip";
import { leaveStatusLabel, type LeaveApprovalPresentationStatus } from "../../leave-approval";

/** The real, existing presentation status vocabulary only — no `cancelled`
 * option (no such backend status exists) and `"unknown"` is deliberately
 * excluded (a defensive fallback, never a real record's actual status). */
const FILTERABLE_STATUSES: LeaveApprovalPresentationStatus[] = [
  "awaiting_response",
  "approved",
  "rejected",
  "expired",
];

export interface HistoryFilterChipsProps {
  selected: LeaveApprovalPresentationStatus[];
  onChange: (next: LeaveApprovalPresentationStatus[]) => void;
}

/** Multi-select status filter (Phase 4 Prompt 10) — thin wrapper around the
 * existing `SelectableChip` primitive, no new interactive control invented. */
export function HistoryFilterChips({ selected, onChange }: HistoryFilterChipsProps) {
  function toggle(status: LeaveApprovalPresentationStatus) {
    if (selected.includes(status)) {
      onChange(selected.filter((existing) => existing !== status));
    } else {
      onChange([...selected, status]);
    }
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="none"
    >
      {FILTERABLE_STATUSES.map((status) => (
        <SelectableChip
          key={status}
          label={leaveStatusLabel(status)}
          selected={selected.includes(status)}
          onPress={() => toggle(status)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 4 },
});
