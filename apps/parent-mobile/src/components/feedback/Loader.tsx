import { ActivityIndicator, View } from "react-native";
import { useThemeContext } from "../../contexts/ThemeContext";

export interface LoaderProps {
  /** Full-page centered loader vs. an inline one. */
  fullPage?: boolean;
}

export function Loader({ fullPage = false }: LoaderProps) {
  const { theme } = useThemeContext();
  if (!fullPage) return <ActivityIndicator color={theme.colors.primary} />;
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.colors.background,
      }}
      accessibilityRole="progressbar"
    >
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );
}
