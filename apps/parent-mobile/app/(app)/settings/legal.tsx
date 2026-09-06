import { ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { Card } from "@/src/components/ui/Card";
import { NavigationRow } from "@/src/features/settings/components/NavigationRow";
import { LEGAL_DOCUMENTS } from "@/src/features/settings/legalContent";

/** Legal document list (Prompt 11). Every document is explicitly labeled
 * "Placeholder" — see `legalContent.ts`'s doc comment: no approved legal
 * document exists in this repository yet. */
export default function Legal() {
  const router = useRouter();

  return (
    <PageContainer>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <PageHeader title="Legal" subtitle="Terms, policies, and licenses." />
        <Card>
          {LEGAL_DOCUMENTS.map((doc) => (
            <NavigationRow
              key={doc.id}
              title={doc.title}
              trailingLabel={doc.isPlaceholder ? "Placeholder" : undefined}
              onPress={() =>
                router.push({ pathname: "/(app)/settings/legal/[doc]", params: { doc: doc.id } })
              }
              accessibilityHint={`Opens ${doc.title}${doc.isPlaceholder ? ", currently placeholder text" : ""}`}
            />
          ))}
        </Card>
      </ScrollView>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 32 },
});
