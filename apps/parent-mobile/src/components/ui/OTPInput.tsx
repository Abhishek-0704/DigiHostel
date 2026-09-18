import { useEffect, useRef } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useThemeContext } from "../../contexts/ThemeContext";

export interface OTPInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  errorMessage?: string;
  accessibilityLabel?: string;
}

/**
 * Segmented OTP entry (Prompt 4A). Implemented as ONE real, focusable
 * `TextInput` (numeric, capped at `length`) with `length` decorative boxes
 * rendered from its current value — not `length` separately-focused inputs.
 *
 * This is deliberate, not a simplification: a single input gets automatic
 * focus/backspace/paste/OS-autofill handling for free from the platform,
 * which is exactly what this prompt requires (automatic advancement,
 * backspace, paste support, secure/autofill-compatible entry) without
 * fragile manual focus-juggling across multiple refs. It is also the more
 * robust choice for screen readers: there is exactly one interactive
 * element in the accessibility tree (the real input); the boxes are marked
 * `accessibilityElementsHidden` so they're never announced as six separate,
 * confusing controls.
 *
 * Never persists or logs the entered value — purely controlled by the
 * parent screen's own state.
 */
export function OTPInput({
  length = 6,
  value,
  onChange,
  onComplete,
  autoFocus = true,
  disabled = false,
  errorMessage,
  accessibilityLabel = "One-time verification code",
}: OTPInputProps) {
  const { theme } = useThemeContext();
  const inputRef = useRef<TextInput>(null);
  const hasError = Boolean(errorMessage);

  // See TextField.tsx's identical fix — `accessibilityRole="alert"` alone
  // is not reliably announced by TalkBack/VoiceOver on this platform.
  useEffect(() => {
    if (errorMessage) {
      AccessibilityInfo.announceForAccessibility(errorMessage);
    }
  }, [errorMessage]);

  const handleChangeText = (text: string) => {
    const digitsOnly = text.replace(/[^0-9]/g, "").slice(0, length);
    onChange(digitsOnly);
    if (digitsOnly.length === length) {
      onComplete?.(digitsOnly);
    }
  };

  const focusInput = () => inputRef.current?.focus();

  return (
    <View>
      <Pressable onPress={focusInput} disabled={disabled}>
        <View
          style={styles.boxRow}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {Array.from({ length }).map((_, index) => {
            const digit = value[index] ?? "";
            const isActive = !disabled && index === value.length;
            return (
              <View
                key={index}
                style={[
                  styles.box,
                  {
                    borderColor: hasError
                      ? theme.colors.error
                      : isActive
                        ? theme.colors.primary
                        : theme.colors.border,
                    borderWidth: isActive ? 2 : 1.5,
                    borderRadius: theme.radii.md,
                    backgroundColor: disabled ? theme.colors.surfaceVariant : theme.colors.surface,
                  },
                ]}
              >
                <Text style={[styles.digit, { color: theme.colors.textPrimary }]}>{digit}</Text>
              </View>
            );
          })}
        </View>
      </Pressable>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChangeText}
        keyboardType="number-pad"
        maxLength={length}
        autoFocus={autoFocus}
        editable={!disabled}
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={`Enter the ${length}-digit code sent to your phone`}
        caretHidden
        style={styles.hiddenInput}
      />
      {hasError ? (
        <Text
          style={[styles.error, { color: theme.colors.error, marginTop: theme.spacing.sm }]}
          accessibilityRole="alert"
        >
          {errorMessage}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  boxRow: { flexDirection: "row", justifyContent: "space-between" },
  box: {
    width: 48,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  digit: { fontSize: 22, fontWeight: "700" },
  // Off-screen, not display:none — a hidden/zero-opacity-but-present input
  // stays keyboard-focusable and screen-reader-reachable; display:none would
  // remove it from both.
  hiddenInput: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 1,
    height: 1,
    opacity: 0,
  },
  error: { fontSize: 12 },
});
