import { StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../contexts/ThemeContext";
import { Button } from "../ui/Button";

export interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  const { theme } = useThemeContext();
  return (
    <View
      style={[styles.container, { padding: theme.spacing.xl }]}
      accessibilityRole="text"
      accessible
    >
      <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{title}</Text>
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
          <Button label={actionLabel} variant="secondary" onPress={onAction} />
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
