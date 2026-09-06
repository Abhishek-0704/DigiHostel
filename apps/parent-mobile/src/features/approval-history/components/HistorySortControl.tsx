import { View, StyleSheet } from "react-native";
import { SelectableChip } from "../../../components/ui/SelectableChip";
import type { HistorySortDirection, HistorySortField } from "../historySort";

const FIELD_LABEL: Record<HistorySortField, string> = {
  requestedAt: "Requested date",
  decidedAt: "Decided date",
  status: "Status",
};

const FIELDS = Object.keys(FIELD_LABEL) as HistorySortField[];

function directionLabel(field: HistorySortField, direction: HistorySortDirection): string {
  if (field === "status") return direction === "asc" ? "A to Z" : "Z to A";
  return direction === "asc" ? "Oldest first" : "Newest first";
}

export interface HistorySortControlProps {
  field: HistorySortField;
  direction: HistorySortDirection;
  onChange: (field: HistorySortField, direction: HistorySortDirection) => void;
}

/** Sort field + direction control (Phase 4 Prompt 10) — no existing sort UI
 * pattern exists anywhere in this app, so this is a genuinely new, minimal
 * composition of the existing `SelectableChip` primitive rather than a new
 * dependency. Direction labels are spelled out in words, never an arrow
 * glyph alone, so meaning survives without relying on iconography. */
export function HistorySortControl({ field, direction, onChange }: HistorySortControlProps) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {FIELDS.map((candidate) => (
          <SelectableChip
            key={candidate}
            label={FIELD_LABEL[candidate]}
            selected={field === candidate}
            onPress={() => onChange(candidate, direction)}
          />
        ))}
      </View>
      <View style={styles.row}>
        <SelectableChip
          label={directionLabel(field, "desc")}
          selected={direction === "desc"}
          onPress={() => onChange(field, "desc")}
        />
        <SelectableChip
          label={directionLabel(field, "asc")}
          selected={direction === "asc"}
          onPress={() => onChange(field, "asc")}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
});
