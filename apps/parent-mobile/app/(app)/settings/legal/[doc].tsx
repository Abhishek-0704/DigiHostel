import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { Card } from "@/src/components/ui/Card";
import { SecurityBanner } from "@/src/components/ui/SecurityBanner";
import { EmptyState } from "@/src/components/feedback/EmptyState";
import { LEGAL_DOCUMENTS } from "@/src/features/settings/legalContent";
import { useTheme } from "@/src/hooks/useTheme";

/** Legal document detail (Prompt 11). Clearly distinguishes placeholder
 * text from an approved policy via a visible banner whenever
 * `isPlaceholder` is true — never presented as final institutional
 * policy. */
export default function LegalDocumentDetail() {
  const { theme } = useTheme();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const document = LEGAL_DOCUMENTS.find((entry) => entry.id === doc);

  if (!document) {
    return (
      <PageContainer>
        <PageHeader title="Document" />
        <EmptyState
          title="This document isn't available"
          description="It may have been removed or renamed."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <PageHeader title={document.title} />
        {document.isPlaceholder ? (
          <View style={{ marginBottom: theme.spacing.md }}>
            <SecurityBanner
              tone="warning"
              message="This document is placeholder text, not an approved policy."
            />
          </View>
        ) : null}
        <Card>
          <Text style={[styles.body, { color: theme.colors.textPrimary }]}>{document.body}</Text>
        </Card>
      </ScrollView>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 32 },
  body: { fontSize: 14, lineHeight: 21 },
});
