import { useEffect } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../contexts/ThemeContext";
import { Button } from "../ui/Button";
import type { AppError } from "../../types/errors";

export interface ErrorStateProps {
  error: AppError;
  onRetry?: () => void;
}

/** Renders only `error.userMessage` — never `error.cause` or any raw
 * backend/network detail, matching the backend's own G-01 sanitization
 * discipline on the client side. */
export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const { theme } = useThemeContext();

  // See TextField.tsx's identical fix — `accessibilityRole="alert"` alone
  // is not reliably announced by TalkBack/VoiceOver on this platform.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(error.userMessage);
  }, [error.userMessage]);

  return (
    <View
      style={[styles.container, { padding: theme.spacing.xl }]}
      accessibilityRole="alert"
      accessible
    >
      <Text style={[styles.message, { color: theme.colors.textPrimary }]}>{error.userMessage}</Text>
      {onRetry ? (
        <View style={{ marginTop: theme.spacing.md }}>
          <Button label="Try again" variant="secondary" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center" },
  message: { fontSize: 15, textAlign: "center" },
});
