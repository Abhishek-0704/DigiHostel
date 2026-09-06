import { ScrollView, StyleSheet, Text, View } from "react-native";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { Card } from "@/src/components/ui/Card";
import { Divider } from "@/src/components/ui/Divider";
import { SectionHeader } from "@/src/components/ui/SectionHeader";
import { FAQ_ENTRIES, SUPPORT_ACTIONS } from "@/src/features/settings/supportContent";
import { useTheme } from "@/src/hooks/useTheme";

/**
 * Help & Support (Prompt 11). No ticketing backend exists
 * (`apps/api/src/routes/` has no support route) — every support action
 * states plainly what happens next rather than simulating a submitted
 * ticket (`supportContent.ts`'s own doc comment).
 */
export default function Help() {
  const { theme } = useTheme();

  return (
    <PageContainer>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <PageHeader title="Help & Support" />

        <SectionHeader title="Frequently asked questions" />
        <Card>
          {FAQ_ENTRIES.map((entry, index) => (
            <View key={entry.id}>
              {index > 0 ? <Divider /> : null}
              <View style={{ paddingVertical: theme.spacing.sm }}>
                <Text style={[styles.question, { color: theme.colors.textPrimary }]}>
                  {entry.question}
                </Text>
                <Text style={[styles.answer, { color: theme.colors.textSecondary, marginTop: 4 }]}>
                  {entry.answer}
                </Text>
              </View>
            </View>
          ))}
        </Card>

        <View style={{ marginTop: theme.spacing.lg }}>
          <SectionHeader title="Get in touch" />
          <Card>
            {SUPPORT_ACTIONS.map((action, index) => (
              <View key={action.id}>
                {index > 0 ? <Divider /> : null}
                <View style={{ paddingVertical: theme.spacing.sm }}>
                  <Text style={[styles.question, { color: theme.colors.textPrimary }]}>
                    {action.title}
                  </Text>
                  <Text
                    style={[styles.answer, { color: theme.colors.textSecondary, marginTop: 4 }]}
                  >
                    {action.description}
                  </Text>
                  <Text
                    style={[styles.whatNext, { color: theme.colors.textDisabled, marginTop: 4 }]}
                  >
                    {action.whatHappensNext}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </View>
      </ScrollView>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 32 },
  question: { fontSize: 14, fontWeight: "700" },
  answer: { fontSize: 13, lineHeight: 19 },
  whatNext: { fontSize: 12, fontStyle: "italic" },
});
