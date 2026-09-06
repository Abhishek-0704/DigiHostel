import { Pressable, StyleSheet, Text } from "react-native";
import { useThemeContext } from "../../contexts/ThemeContext";

export interface SelectableChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

/** Generic selectable pill (Prompt 8) — for a filter/sort chip row. Distinct
 * from `Badge` (a static, non-interactive label): this carries a real
 * selected/unselected interaction state and touch target. Selection is
 * conveyed by both background color AND `accessibilityState.selected` —
 * never color alone. */
export function SelectableChip({ label, selected, onPress }: SelectableChipProps) {
  const { theme } = useThemeContext();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceVariant,
          borderRadius: theme.radii.full,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: selected ? theme.colors.onPrimary : theme.colors.textSecondary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: 44, paddingHorizontal: 14, justifyContent: "center", alignItems: "center" },
  label: { fontSize: 13, fontWeight: "600" },
});
