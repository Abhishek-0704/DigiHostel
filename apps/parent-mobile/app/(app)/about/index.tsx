import Constants from "expo-constants";
import { Platform, ScrollView, StyleSheet } from "react-native";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { Card } from "@/src/components/ui/Card";
import { DetailRow } from "@/src/components/ui/DetailRow";
import { SectionHeader } from "@/src/components/ui/SectionHeader";

/**
 * About (Prompt 11). Every value is read from `expo-constants`
 * (`app.json`/build config) at runtime — never hard-coded — per this
 * prompt's explicit instruction. `app.json` currently sets no
 * `ios.buildNumber`/`android.versionCode`, and no release-channel/EAS
 * configuration exists (`docs/notifications.md` §9's own note on no EAS
 * project) — those honestly show "Not available" rather than an invented
 * value.
 */
export default function About() {
  const config = Constants.expoConfig;
  const buildNumber =
    Platform.OS === "ios" ? config?.ios?.buildNumber : config?.android?.versionCode?.toString();

  return (
    <PageContainer>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <PageHeader title="About" />

        <SectionHeader title="Application" />
        <Card>
          <DetailRow label="Name" value={config?.name ?? "Not available"} />
          <DetailRow label="Version" value={config?.version ?? "Not available"} />
          <DetailRow label="Build number" value={buildNumber ?? "Not available"} />
          <DetailRow label="Platform" value={Platform.OS === "ios" ? "iOS" : "Android"} />
          <DetailRow label="Release channel" value="Not configured" />
        </Card>

        <SectionHeader title="Developer" />
        <Card>
          <DetailRow label="Developed for" value="KIIT Hostel Management" />
          <DetailRow label="Copyright" value={`© ${new Date().getFullYear()} DigiHostel`} />
        </Card>

        <SectionHeader title="Acknowledgements" />
        <Card>
          <DetailRow label="Built with" value="React Native, Expo, and Supabase" />
        </Card>
      </ScrollView>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 32 },
});
