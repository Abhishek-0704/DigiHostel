import { ScrollView, StyleSheet } from "react-native";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { SecurityInformationCard } from "@/src/components/ui/SecurityInformationCard";
import { DEVICE_SECURITY_TIPS } from "@/src/features/devices/deviceContent";

/** Device Security Tips (Prompt 4B) — standalone, reachable from the
 * Trusted Device List/Details screens. Shares its content source
 * (deviceContent.ts) with the onboarding registration screen's inline
 * explainer, which uses a different section set (why/how/what's-stored)
 * since it's shown at a different moment in the journey. */
export default function SecurityTips() {
  return (
    <PageContainer>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <PageHeader
          title="Device security tips"
          subtitle="A few things to help keep your account and your child's leave approvals secure."
        />
        <SecurityInformationCard sections={DEVICE_SECURITY_TIPS} />
      </ScrollView>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 32 },
});
