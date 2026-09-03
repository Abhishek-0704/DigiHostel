import { View, type ViewProps } from "react-native";
import { useThemeContext } from "../../contexts/ThemeContext";

export interface CardProps extends ViewProps {
  elevated?: boolean;
}

export function Card({ elevated = false, style, children, ...viewProps }: CardProps) {
  const { theme } = useThemeContext();
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.lg,
          padding: theme.spacing.md,
          borderWidth: elevated ? 0 : 1,
          borderColor: theme.colors.border,
          ...(elevated ? theme.elevation.low : theme.elevation.none),
        },
        style,
      ]}
      {...viewProps}
    >
      {children}
    </View>
  );
}
