import { ScrollView, StyleSheet, Text, View } from "react-native";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { Card } from "@/src/components/ui/Card";
import { Divider } from "@/src/components/ui/Divider";
import { PRIVACY_SECTIONS } from "@/src/features/settings/privacyContent";
import { useTheme } from "@/src/hooks/useTheme";

/**
 * Privacy (Prompt 11) — user-facing, non-technical educational content.
 * Never exposes database schema, RLS policy names, or internal API/service
 * details — see `privacyContent.ts`'s own doc comment.
 */
export default function Privacy() {
  const { theme } = useTheme();

  return (
    <PageContainer>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <PageHeader title="Privacy" subtitle="How your information is used and protected." />
        <Card>
          {PRIVACY_SECTIONS.map((section, index) => (
            <View key={section.id}>
              {index > 0 ? <Divider /> : null}
              <View style={{ paddingVertical: theme.spacing.sm }}>
                <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
                  {section.title}
                </Text>
                <Text style={[styles.body, { color: theme.colors.textSecondary, marginTop: 4 }]}>
                  {section.body}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      </ScrollView>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 32 },
  title: { fontSize: 14, fontWeight: "700" },
  body: { fontSize: 13, lineHeight: 19 },
});
