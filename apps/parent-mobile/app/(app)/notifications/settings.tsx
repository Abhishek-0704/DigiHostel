import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { SectionHeader } from "@/src/components/ui/SectionHeader";
import { Card } from "@/src/components/ui/Card";
import { Badge } from "@/src/components/ui/Badge";
import { Button } from "@/src/components/ui/Button";
import { Divider } from "@/src/components/ui/Divider";
import {
  CATEGORY_LABELS,
  CATEGORIES_WITH_REAL_DATA,
} from "@/src/features/notifications/notificationClassification";
import { notificationService } from "@/src/services/notifications/notifications";
import { useNotifications } from "@/src/hooks/useNotifications";
import { useTheme } from "@/src/hooks/useTheme";
import type { NotificationCategory } from "@/src/features/notifications/notificationTypes";

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as NotificationCategory[];

/**
 * Notification Settings placeholder (Prompt 8's explicit `<notification_settings>`
 * scope — UI structure only, no business-settings persistence).
 *
 * Push permission status/request IS real (`useNotifications()` →
 * `NotificationContext`, backed by `expo-notifications` — Prompt 8). Push
 * token acquisition is a real, on-demand capability check (never
 * auto-triggered). Backend registration and per-category preferences are
 * explicitly labeled unavailable/coming-soon — no Fastify endpoint exists to
 * persist either (see docs/notifications.md's capability matrix). Category
 * toggles are deliberately NOT interactive controls: a disabled-looking
 * switch a user could tap while believing it saves something would be
 * exactly the "fake mutation" this prompt's rules forbid.
 *
 * Prompt 11 addition: Sound/Vibration/Preview/Quiet Hours are OS-level
 * notification-style concepts this app has no portable, cross-platform way
 * to read or set today (`expo-notifications` only exposes them per Android
 * notification channel, and no channel is created by this app yet). Shown
 * as the same "Coming soon" future-ready rows as the per-category list
 * above, never as working toggles.
 */
export default function NotificationSettings() {
  const { theme } = useTheme();
  const { permissionStatus, isLoadingPermissionStatus, requestPermission } = useNotifications();
  const [tokenCheck, setTokenCheck] = useState<"idle" | "checking" | "available" | "unavailable">(
    "idle",
  );

  const handleCheckPushCapability = async () => {
    setTokenCheck("checking");
    const token = await notificationService.getPushToken();
    setTokenCheck(token ? "available" : "unavailable");
  };

  return (
    <PageContainer>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <PageHeader title="Notification Settings" />

        <SectionHeader title="Push notifications" />
        <Card>
          <View style={styles.row}>
            <Text style={[styles.label, { color: theme.colors.textPrimary }]}>Permission</Text>
            <Badge
              label={
                isLoadingPermissionStatus
                  ? "Checking…"
                  : permissionStatus === "granted"
                    ? "Granted"
                    : permissionStatus === "denied"
                      ? "Denied"
                      : "Not requested"
              }
              tone={permissionStatus === "granted" ? "success" : "neutral"}
            />
          </View>
          {permissionStatus !== "granted" ? (
            <View style={{ marginTop: theme.spacing.sm }}>
              <Button
                label="Enable notifications"
                variant="secondary"
                onPress={() => {
                  requestPermission().catch(() => {});
                }}
              />
            </View>
          ) : null}
          <Divider />
          <View style={[styles.row, { marginTop: theme.spacing.sm }]}>
            <Text style={[styles.label, { color: theme.colors.textPrimary }]}>
              Device capability
            </Text>
            <Badge
              label={
                tokenCheck === "checking"
                  ? "Checking…"
                  : tokenCheck === "available"
                    ? "Available"
                    : tokenCheck === "unavailable"
                      ? "Unavailable"
                      : "Not checked"
              }
              tone={tokenCheck === "available" ? "success" : "neutral"}
            />
          </View>
          <View style={{ marginTop: theme.spacing.sm }}>
            <Button
              label="Check push capability"
              variant="ghost"
              onPress={handleCheckPushCapability}
            />
          </View>
          <Divider />
          <View style={[styles.row, { marginTop: theme.spacing.sm }]}>
            <Text style={[styles.label, { color: theme.colors.textPrimary }]}>
              Registered with DigiHostel
            </Text>
            <Badge label="Not available yet" tone="neutral" />
          </View>
        </Card>

        <SectionHeader
          title="Categories"
          subtitle="Per-category preferences aren't available yet."
        />
        <Card>
          {ALL_CATEGORIES.map((category, index) => (
            <View key={category}>
              {index > 0 ? <Divider /> : null}
              <View style={[styles.row, index > 0 ? { marginTop: theme.spacing.sm } : null]}>
                <Text style={[styles.label, { color: theme.colors.textPrimary }]}>
                  {CATEGORY_LABELS[category]}
                </Text>
                <Badge
                  label={CATEGORIES_WITH_REAL_DATA.includes(category) ? "Always on" : "Coming soon"}
                  tone="neutral"
                />
              </View>
            </View>
          ))}
        </Card>

        <SectionHeader title="Sound & appearance" subtitle="Not configurable from the app yet." />
        <Card>
          {["Sound", "Vibration", "Notification preview", "Quiet hours"].map((label, index) => (
            <View key={label}>
              {index > 0 ? <Divider /> : null}
              <View style={[styles.row, index > 0 ? { marginTop: theme.spacing.sm } : null]}>
                <Text style={[styles.label, { color: theme.colors.textPrimary }]}>{label}</Text>
                <Badge label="Coming soon" tone="neutral" />
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
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  label: { fontSize: 14, fontWeight: "600" },
});
