import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { Loader } from "@/src/components/feedback/Loader";
import { ErrorState } from "@/src/components/feedback/ErrorState";
import { EmptyState } from "@/src/components/feedback/EmptyState";
import { Button } from "@/src/components/ui/Button";
import { DeviceCard } from "@/src/features/devices/components/DeviceCard";
import { useDevice } from "@/src/hooks/useDevice";
import { useTheme } from "@/src/hooks/useTheme";
import type { TrustedDeviceSummary } from "@/src/services/devices/devices";

/**
 * Trusted Devices List (Prompt 4B; relocated from `security/index.tsx` to
 * this dedicated route in Prompt 6 once Security Center Home took over the
 * group's entry point — see `security/index.tsx`'s own doc comment).
 *
 * Real, RLS-scoped data via `deviceService.listTrustedDevices()` — every
 * device belonging to the signed-in parent, active and revoked. No
 * fabricated rows, no "last active" column (the backend doesn't track
 * one). `useDevice()` is now TanStack-Query-backed (Prompt 6) — this
 * screen shares its cached list with Security Center Home and Device
 * Details rather than re-fetching independently; `isRefreshing` comes
 * straight from the query's own background-refetch state, no local
 * duplicate boolean needed.
 *
 * Search/filter/sort UI is deliberately not built here — see
 * `features/devices/deviceFilters.ts`'s doc comment for why the prepared
 * pure logic exists without a wired-up UI yet.
 */
export default function TrustedDevicesList() {
  const { theme } = useTheme();
  const router = useRouter();
  const { devices, isLoading, isRefreshing, error, refresh } = useDevice();

  const openDetails = (device: TrustedDeviceSummary) => {
    router.push({ pathname: "/(app)/security/[deviceId]", params: { deviceId: device.id } });
  };

  if (isLoading && devices.length === 0 && !error) {
    return (
      <PageContainer>
        <Loader fullPage />
      </PageContainer>
    );
  }

  if (error && devices.length === 0) {
    return (
      <PageContainer>
        <ErrorState error={error} onRetry={refresh} />
      </PageContainer>
    );
  }

  return (
    <PageContainer edges={["bottom", "left", "right"]}>
      <FlatList
        data={devices}
        keyExtractor={(device) => device.id}
        renderItem={({ item }) => <DeviceCard device={item} onPress={() => openDetails(item)} />}
        contentContainerStyle={devices.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title="No trusted devices yet"
            description="Devices you verify will appear here."
            actionLabel="Learn more about device security"
            onAction={() => router.push("/(app)/security/tips")}
          />
        }
        ListFooterComponent={
          devices.length > 0 ? (
            <View style={{ marginTop: theme.spacing.md, marginBottom: theme.spacing.xl, gap: 8 }}>
              <Button
                label="Biometric authentication"
                variant="ghost"
                onPress={() => router.push("/(app)/security/biometric")}
              />
              <Button
                label="Learn more about device security"
                variant="ghost"
                onPress={() => router.push("/(app)/security/tips")}
              />
            </View>
          ) : null
        }
      />
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingTop: 16, paddingBottom: 16 },
  emptyContainer: { flexGrow: 1, justifyContent: "center" },
});
