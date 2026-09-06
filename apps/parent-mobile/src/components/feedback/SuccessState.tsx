import { StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../contexts/ThemeContext";
import { Button } from "../ui/Button";

export interface SuccessStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Mirrors EmptyState/ErrorState's shape — the third member of that trio.
 * No checkmark icon/illustration: no icon library is installed in this app
 * (see foundation.md's dependency rationale), so the tone is carried by
 * `theme.colors.success` text alone, paired with the message itself, never
 * color alone. */
export function SuccessState({ title, description, actionLabel, onAction }: SuccessStateProps) {
  const { theme } = useThemeContext();
  return (
    <View
      style={[styles.container, { padding: theme.spacing.xl }]}
      accessibilityRole="text"
      accessible
      accessibilityLiveRegion="polite"
    >
      <Text style={[styles.title, { color: theme.colors.success }]}>{title}</Text>
      {description ? (
        <Text
          style={[
            styles.description,
            { color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
          ]}
        >
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: theme.spacing.md }}>
          <Button label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "600", textAlign: "center" },
  description: { fontSize: 14, textAlign: "center" },
});
