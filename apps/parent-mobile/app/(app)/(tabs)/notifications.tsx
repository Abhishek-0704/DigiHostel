import { useCallback, useEffect } from "react";
import {
  AccessibilityInfo,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { TextField } from "@/src/components/ui/TextField";
import { SelectableChip } from "@/src/components/ui/SelectableChip";
import { Button } from "@/src/components/ui/Button";
import { Skeleton } from "@/src/components/feedback/Skeleton";
import { EmptyState } from "@/src/components/feedback/EmptyState";
import { ErrorState } from "@/src/components/feedback/ErrorState";
import { NotificationCard } from "@/src/features/notifications/components/NotificationCard";
import {
  NOTIFICATION_FILTER_OPTIONS,
  type NotificationFilter,
} from "@/src/features/notifications/notificationFilters";
import { NOTIFICATION_SORT_OPTIONS } from "@/src/features/notifications/notificationSorting";
import { useNotificationCenter } from "@/src/hooks/useNotificationCenter";
import { useTheme } from "@/src/hooks/useTheme";
import type { ParentNotification } from "@/src/features/notifications/notificationTypes";

function filterKey(filter: NotificationFilter): string {
  return typeof filter === "string" ? filter : `category:${filter.category}`;
}

/**
 * Notification Center (Prompt 8) — real, RLS-scoped list
 * (`notificationService.listNotifications()`), local search/filter/sort
 * (`src/features/notifications/`), realtime invalidation, and pull-to-refresh.
 *
 * "Mark all read" is wired to a real service call that always resolves to
 * `NotificationActionNotSupportedError` (no backend read-state exists yet —
 * see `src/services/notifications/notificationActions.ts`) — pressing it
 * shows `actionError`'s honest message, never a fake success.
 *
 * The header/search/filter/sort controls live in `ListHeaderComponent` so
 * `FlatList` owns the single scrollable region (no ScrollView-in-ScrollView
 * nesting), consistent with `security/devices.tsx`'s existing FlatList
 * pattern.
 */
export default function NotificationCenter() {
  const { theme } = useTheme();
  const router = useRouter();
  const {
    notifications,
    allNotifications,
    isLoading,
    isRefreshing,
    error,
    refresh,
    realtimeStatus,
    searchQuery,
    setSearchQuery,
    filter,
    setFilter,
    sortOrder,
    setSortOrder,
    performAction,
    actionError,
  } = useNotificationCenter();

  // See src/components/ui/TextField.tsx's identical fix — `accessibilityRole="alert"`
  // alone is not reliably announced by TalkBack/VoiceOver on this platform.
  // Placed before the early returns below (rules of hooks).
  useEffect(() => {
    if (actionError) {
      AccessibilityInfo.announceForAccessibility(actionError.userMessage);
    }
  }, [actionError]);

  const openDetails = useCallback(
    (notification: ParentNotification) => {
      router.push({ pathname: "/(app)/notifications/[id]", params: { id: notification.id } });
    },
    [router],
  );

  const handleMarkAllRead = () => {
    performAction({ kind: "markAllAsRead" }).catch(() => {
      // actionError (from the hook) already carries the mapped, safe
      // message — nothing further to do here.
    });
  };

  if (isLoading && allNotifications.length === 0 && !error) {
    return (
      <PageContainer edges={["top", "left", "right"]}>
        <PageHeader title="Notifications" />
        <View style={{ gap: theme.spacing.sm }}>
          <Skeleton height={96} />
          <Skeleton height={96} />
          <Skeleton height={96} />
        </View>
      </PageContainer>
    );
  }

  if (error && allNotifications.length === 0) {
    return (
      <PageContainer edges={["top", "left", "right"]}>
        <PageHeader title="Notifications" />
        <ErrorState error={error} onRetry={refresh} />
      </PageContainer>
    );
  }

  const hasSearchOrFilter = searchQuery.trim().length > 0 || filter !== "all";

  return (
    <PageContainer edges={["top", "left", "right"]}>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NotificationCard notification={item} onPress={() => openDetails(item)} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
        contentContainerStyle={
          notifications.length === 0 ? styles.emptyContainer : styles.listContent
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
          />
        }
        ListHeaderComponent={
          <View>
            <PageHeader
              title="Notifications"
              subtitle={
                realtimeStatus === "connected"
                  ? "Live"
                  : realtimeStatus === "connecting"
                    ? "Connecting…"
                    : "Pull to refresh for the latest"
              }
              actions={[
                {
                  label: "Settings",
                  onPress: () => router.push("/(app)/notifications/settings"),
                  accessibilityLabel: "Notification settings",
                },
              ]}
            />
            <TextField
              placeholder="Search notifications"
              value={searchQuery}
              onChangeText={setSearchQuery}
              accessibilityLabel="Search notifications"
              returnKeyType="search"
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: theme.spacing.sm }}
              contentContainerStyle={styles.chipRow}
            >
              {NOTIFICATION_FILTER_OPTIONS.map((option) => (
                <SelectableChip
                  key={filterKey(option.filter)}
                  label={option.label}
                  selected={filterKey(option.filter) === filterKey(filter)}
                  onPress={() => setFilter(option.filter)}
                />
              ))}
            </ScrollView>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: theme.spacing.xs }}
              contentContainerStyle={styles.chipRow}
            >
              {NOTIFICATION_SORT_OPTIONS.map((option) => (
                <SelectableChip
                  key={option.order}
                  label={option.label}
                  selected={option.order === sortOrder}
                  onPress={() => setSortOrder(option.order)}
                />
              ))}
            </ScrollView>
            {allNotifications.length > 0 ? (
              <View style={{ marginTop: theme.spacing.xs, alignItems: "flex-end" }}>
                <Button
                  label="Mark all read"
                  variant="ghost"
                  onPress={handleMarkAllRead}
                  accessibilityHint="This action isn't available yet"
                />
              </View>
            ) : null}
            {actionError ? (
              <Text
                accessibilityRole="alert"
                style={{ color: theme.colors.error, fontSize: 12, marginTop: theme.spacing.xs }}
              >
                {actionError.userMessage}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          allNotifications.length === 0 ? (
            <EmptyState
              title="No notifications yet"
              description="You'll see leave-approval alerts and other updates here."
            />
          ) : hasSearchOrFilter ? (
            <EmptyState
              title="No matching notifications"
              description="Try a different search term or filter."
              actionLabel="Clear filters"
              onAction={() => {
                setSearchQuery("");
                setFilter("all");
              }}
            />
          ) : null
        }
      />
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  chipRow: { gap: 8, paddingVertical: 4 },
  listContent: { paddingTop: 12, paddingBottom: 24 },
  emptyContainer: { flexGrow: 1, justifyContent: "center" },
});
