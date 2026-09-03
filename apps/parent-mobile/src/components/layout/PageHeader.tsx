import { StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../contexts/ThemeContext";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  const { theme } = useThemeContext();
  return (
    <View style={{ marginBottom: theme.spacing.md }}>
      <Text style={[styles.title, { color: theme.colors.textPrimary }]} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={[
            styles.subtitle,
            { color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
          ]}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: "700" },
  subtitle: { fontSize: 14 },
});
