import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, type ViewProps } from "react-native";
import { useThemeContext } from "../../contexts/ThemeContext";

export interface PageContainerProps extends ViewProps {
  /** Edges to apply safe-area insets to — defaults to all, override for
   * screens that manage their own header (e.g. inside a tab/stack navigator
   * that already reserves the top inset). */
  edges?: Array<"top" | "bottom" | "left" | "right">;
}

/** Generic screen-level container: safe-area handling + background color +
 * consistent horizontal padding. Carries no feature-specific logic. */
export function PageContainer({
  edges = ["top", "bottom", "left", "right"],
  style,
  children,
  ...viewProps
}: PageContainerProps) {
  const { theme } = useThemeContext();
  return (
    <SafeAreaView
      edges={edges}
      style={[
        styles.container,
        { backgroundColor: theme.colors.background, paddingHorizontal: theme.spacing.md },
        style,
      ]}
      {...viewProps}
    >
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
