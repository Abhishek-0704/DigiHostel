import { ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { NavigationRow } from "@/src/features/settings/components/NavigationRow";
import { SettingsSectionGroup } from "@/src/features/settings/components/SettingsSectionGroup";
import { SETTINGS_SECTIONS } from "@/src/features/settings/settingsSections";

/**
 * Settings Home (Prompt 11) — a clean, predictable hierarchy of the seven
 * recommended top-level sections. Every row navigates to a real screen;
 * "Notifications" reuses the EXISTING `/(app)/notifications/settings`
 * screen (Prompt 8) rather than a new duplicate.
 */
export default function SettingsHome() {
  const router = useRouter();

  return (
    <PageContainer edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <PageHeader title="Settings" />
        {SETTINGS_SECTIONS.map((section) => (
          <SettingsSectionGroup key={section.id} title={section.title}>
            {section.rows.map((row) => (
              <NavigationRow
                key={row.id}
                title={row.title}
                description={row.description}
                accessibilityHint={row.accessibilityHint}
                onPress={() => router.push(row.route)}
              />
            ))}
          </SettingsSectionGroup>
        ))}
      </ScrollView>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 32 },
});
