import { StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "../../../contexts/ThemeContext";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import type { Recommendation } from "../securityRecommendations";

export interface RecommendationCardProps {
  recommendation: Recommendation;
  onAction: () => void;
}

export function RecommendationCard({ recommendation, onAction }: RecommendationCardProps) {
  const { theme } = useThemeContext();
  return (
    <Card>
      <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
        {recommendation.title}
      </Text>
      <Text
        style={[
          styles.description,
          { color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
        ]}
      >
        {recommendation.description}
      </Text>
      <View style={{ marginTop: theme.spacing.sm, alignItems: "flex-start" }}>
        <Button
          label={recommendation.actionLabel}
          variant="ghost"
          onPress={onAction}
          accessibilityHint={recommendation.title}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 14, fontWeight: "600" },
  description: { fontSize: 13, lineHeight: 18 },
});
