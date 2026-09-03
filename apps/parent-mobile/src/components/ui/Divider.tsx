import { StyleSheet, View } from "react-native";
import { useThemeContext } from "../../contexts/ThemeContext";

export function Divider() {
  const { theme } = useThemeContext();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border }}
    />
  );
}
