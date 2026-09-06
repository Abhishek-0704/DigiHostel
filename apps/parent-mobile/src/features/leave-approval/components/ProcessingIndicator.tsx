import { StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../../contexts/ThemeContext";
import { Loader } from "../../../components/feedback/Loader";

export interface ProcessingIndicatorProps {
  message: string;
}

/** Reused across `preparing_verification`/`processing_approval`/
 * `processing_rejection` — the same `Loader` + status-text composition
 * `security/[deviceId].tsx`'s own confirm panels already use, extracted
 * here since this prompt's leave-approval flow has three call sites for it.
 * No fake progress bar, no artificial delay — this renders for exactly as
 * long as the caller keeps this UI state active. */
export function ProcessingIndicator({ message }: ProcessingIndicatorProps) {
  const { theme } = useThemeContext();
  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel={message}>
      <Loader />
      <Text
        style={[styles.message, { color: theme.colors.textSecondary, marginTop: theme.spacing.sm }]}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", paddingVertical: 24 },
  message: { fontSize: 14 },
});
