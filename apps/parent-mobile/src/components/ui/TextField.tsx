import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { useThemeContext } from "../../contexts/ThemeContext";

export interface TextFieldProps extends TextInputProps {
  label?: string;
  errorMessage?: string;
}

/** Foundation `TextField`. No OTP-specific behavior here — a future
 * OTP-input component composes this rather than this file knowing about
 * OTP (see src/components/ui/index.ts's doc comment on what stays out of
 * this foundation). */
export function TextField({ label, errorMessage, style, ...inputProps }: TextFieldProps) {
  const { theme } = useThemeContext();
  const hasError = Boolean(errorMessage);

  return (
    <View>
      {label ? (
        <Text
          style={[
            styles.label,
            { color: theme.colors.textSecondary, marginBottom: theme.spacing.xs },
          ]}
        >
          {label}
        </Text>
      ) : null}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.colors.textDisabled}
        style={[
          styles.input,
          {
            borderColor: hasError ? theme.colors.error : theme.colors.border,
            borderRadius: theme.radii.md,
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
            color: theme.colors.textPrimary,
            backgroundColor: theme.colors.surface,
            minHeight: 44,
          },
          style,
        ]}
        {...inputProps}
      />
      {hasError ? (
        <Text
          style={[styles.error, { color: theme.colors.error, marginTop: theme.spacing.xs }]}
          accessibilityRole="alert"
        >
          {errorMessage}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: "600" },
  input: { fontSize: 16, borderWidth: 1 },
  error: { fontSize: 12 },
});
