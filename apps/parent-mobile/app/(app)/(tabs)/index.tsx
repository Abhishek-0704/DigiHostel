import { ScrollView, StyleSheet } from "react-native";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { WelcomeHeader } from "@/src/features/dashboard/components/WelcomeHeader";
import { StudentSummaryCard } from "@/src/features/dashboard/components/StudentSummaryCard";
import { PendingActionsCard } from "@/src/features/dashboard/components/PendingActionsCard";
import { SecurityStatusSection } from "@/src/features/dashboard/components/SecurityStatusSection";
import { QuickActionsSection } from "@/src/features/dashboard/components/QuickActionsSection";
import { RecentActivitySection } from "@/src/features/dashboard/components/RecentActivitySection";
import { FutureInsightsSection } from "@/src/features/dashboard/components/FutureInsightsSection";

/**
 * Home Dashboard (Prompt 7) — the Parent Application shell's first real
 * business screen. Composed of independently maintainable sections rather
 * than one monolithic component, matching the hierarchy this prompt's own
 * `<home_dashboard>` instructions specify:
 *
 *   Home
 *   ├── Welcome Header      (generic greeting + date — no name source exists)
 *   ├── Student Summary     (honest "unavailable" — no student data source exists)
 *   ├── Pending Actions     (honest "unavailable" — leave approval out of scope)
 *   ├── Security Status     (REAL — reuses Prompt 6's Security Center infrastructure)
 *   ├── Quick Actions       (REAL navigation to already-implemented routes)
 *   ├── Recent Activity     (honest "unavailable" — no backend activity feed exists)
 *   └── Future Insights     (UI-only placeholders, no fabricated numbers)
 *
 * Only Security Status and Quick Actions render real, backend-derived state;
 * every other section is either generic (Welcome Header) or an explicit,
 * documented "not available yet" state — never fabricated data. See
 * `docs/foundation.md` §13 for the full data/placeholder boundary table.
 */
export default function Home() {
  return (
    <PageContainer edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <PageHeader title="Home" />
        <WelcomeHeader />
        <StudentSummaryCard />
        <PendingActionsCard />
        <SecurityStatusSection />
        <QuickActionsSection />
        <RecentActivitySection />
        <FutureInsightsSection />
      </ScrollView>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 16 },
});
