import { RefreshControl, ScrollView, type ScrollViewProps } from "react-native";
import { useThemeContext } from "../../contexts/ThemeContext";

export interface ScrollContainerProps extends ScrollViewProps {
  refreshing?: boolean;
  onRefresh?: () => void;
}

/** Generic scrollable content region with optional pull-to-refresh — no
 * feature knowledge of what it's refreshing. */
export function ScrollContainer({
  refreshing,
  onRefresh,
  contentContainerStyle,
  children,
  ...scrollViewProps
}: ScrollContainerProps) {
  const { theme } = useThemeContext();
  return (
    <ScrollView
      contentContainerStyle={[{ paddingBottom: theme.spacing.xl }, contentContainerStyle]}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing ?? false}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        ) : undefined
      }
      {...scrollViewProps}
    >
      {children}
    </ScrollView>
  );
}
