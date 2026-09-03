import { View, type DimensionValue } from "react-native";
import { useThemeContext } from "../../contexts/ThemeContext";

export interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
}

/** Static placeholder block — deliberately no shimmer/pulse animation in
 * this foundation pass (visual-direction instruction: avoid decorative
 * effects/animation not yet supported by an approved design decision). */
export function Skeleton({ width = "100%", height = 16 }: SkeletonProps) {
  const { theme } = useThemeContext();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        width,
        height,
        borderRadius: theme.radii.sm,
        backgroundColor: theme.colors.surfaceVariant,
      }}
    />
  );
}
