import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from "react-native";
import { useThemeContext } from "../../contexts/ThemeContext";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export interface ButtonProps extends Omit<PressableProps, "style" | "children"> {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
}

/** Foundation `Button` — no business logic, no navigation awareness. The
 * "danger" variant exists specifically for the future Reject action (module
 * scope's UI/UX requirement: approve/reject must be unmistakably distinct),
 * not used by anything in this foundation pass. */
export function Button({
  label,
  variant = "primary",
  loading = false,
  fullWidth = false,
  disabled,
  accessibilityRole = "button",
  ...pressableProps
}: ButtonProps) {
  const { theme } = useThemeContext();
  const isDisabled = disabled || loading;

  const backgroundFor: Record<ButtonVariant, string> = {
    primary: theme.colors.primary,
    secondary: theme.colors.surfaceVariant,
    danger: theme.colors.error,
    ghost: "transparent",
  };
  const textColorFor: Record<ButtonVariant, string> = {
    primary: theme.colors.onPrimary,
    secondary: theme.colors.textPrimary,
    danger: theme.colors.onError,
    ghost: theme.colors.primary,
  };

  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: backgroundFor[variant],
          borderRadius: theme.radii.md,
          paddingVertical: theme.spacing.sm + 4,
          paddingHorizontal: theme.spacing.lg,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
          width: fullWidth ? "100%" : undefined,
          // Minimum touch target — accessibility foundation requirement.
          minHeight: 44,
        },
      ]}
      {...pressableProps}
    >
      {loading ? (
        <ActivityIndicator color={textColorFor[variant]} />
      ) : (
        <Text style={[styles.label, { color: textColorFor[variant] }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
  },
});
