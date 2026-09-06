import { useEffect, useRef, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { PageHeader } from "@/src/components/layout/PageHeader";
import { OfflineBanner } from "@/src/components/layout/OfflineBanner";
import { Loader } from "@/src/components/feedback/Loader";
import { EmptyState } from "@/src/components/feedback/EmptyState";
import { ErrorState } from "@/src/components/feedback/ErrorState";
import {
  HistoryCard,
  HistorySearchBar,
  HistoryFilterChips,
  HistorySortControl,
} from "@/src/features/approval-history/components";
import { useApprovalHistory } from "@/src/features/approval-history/hooks/useApprovalHistory";
import { useLeaveRequestRealtime } from "@/src/hooks/useLeaveRequestRealtime";
import { useTheme } from "@/src/hooks/useTheme";
import { useDebounce } from "@/src/hooks/useDebounce";
import type { HistoryRecordPresentation } from "@/src/features/approval-history/historyPresentationMapper";

/**
 * Approval History Home (Phase 4 Prompt 10) — real, backend-integrated list
 * replacing the prior structural placeholder. Data source is the same
 * already-real, parent-scoped `GET /leave-requests` (G-05) Leave Approval's
 * own Pending list already calls — History shows every status, not only
 * pending ones (see `useApprovalHistory`'s own doc comment).
 *
 * Search/filter/sort run client-side over the fetched array — the backend
 * has no pagination/search/filter query support today (confirmed absent
 * from the OpenAPI contract); see `docs/approval-history.md` for the full,
 * honest accounting of this limitation. `loadMore` only reveals more of the
 * already-fetched, already-filtered/sorted array — it triggers no
 * additional network request.
 *
 * `useLeaveRequestRealtime` (same hook/pattern the Leave Approval list
 * already uses, no second realtime architecture) invalidates this list on
 * any visible `leave_requests` change, so a new request, a decision, or an
 * escalation-driven status change elsewhere is reflected without a manual
 * pull-to-refresh.
 */
export default function ApprovalHistory() {
  const { theme } = useTheme();
  const router = useRouter();
  const {
    records,
    hasMore,
    loadMore,
    isLoading,
    isRefreshing,
    error,
    refresh,
    searchQuery,
    setSearchQuery,
    statusFilters,
    setStatusFilters,
    sortField,
    sortDirection,
    setSort,
  } = useApprovalHistory();
  useLeaveRequestRealtime(refresh);

  const [searchInput, setSearchInput] = useState(searchQuery);
  const debouncedSearchInput = useDebounce(searchInput, 300);
  const setSearchQueryRef = useRef(setSearchQuery);
  setSearchQueryRef.current = setSearchQuery;
  useEffect(() => {
    setSearchQueryRef.current(debouncedSearchInput);
    // Only re-run when the debounced value itself changes — setSearchQuery
    // is a fresh function reference every render (see useApprovalHistory),
    // so it is read via a ref (same pattern useLeaveRequestRealtime already
    // uses for onChange) rather than listed as a dependency, which would
    // otherwise re-run this effect — and reset pagination — every render.
  }, [debouncedSearchInput]);

  const openDetails = (record: HistoryRecordPresentation) => {
    router.push({ pathname: "/(app)/history/[id]", params: { id: record.id } });
  };

  const hasAnyFilterOrSearch = searchQuery.trim().length > 0 || statusFilters.length > 0;

  if (isLoading && records.length === 0 && !error) {
    return (
      <PageContainer>
        <PageHeader title="Approval History" />
        <Loader fullPage />
      </PageContainer>
    );
  }

  if (error && records.length === 0) {
    return (
      <PageContainer>
        <PageHeader title="Approval History" />
        <ErrorState error={error} onRetry={refresh} />
      </PageContainer>
    );
  }

  return (
    <PageContainer edges={["bottom", "left", "right"]}>
      <PageHeader title="Approval History" />
      <OfflineBanner />
      <View style={{ paddingHorizontal: theme.spacing.md, gap: theme.spacing.sm }}>
        <HistorySearchBar value={searchInput} onChangeText={setSearchInput} />
        <HistoryFilterChips selected={statusFilters} onChange={setStatusFilters} />
        <HistorySortControl field={sortField} direction={sortDirection} onChange={setSort} />
      </View>
      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <HistoryCard record={item} onPress={() => openDetails(item)} />}
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
        contentContainerStyle={[
          styles.listContent,
          records.length === 0 ? styles.emptyContainer : null,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (hasMore) loadMore();
        }}
        ListFooterComponent={hasMore ? <Loader /> : null}
        ListEmptyComponent={
          hasAnyFilterOrSearch ? (
            <EmptyState
              title="No matching history"
              description="Try a different search term or clear your filters."
            />
          ) : (
            <EmptyState
              title="No approval history yet"
              description="Decided and past leave requests will appear here."
            />
          )
        }
      />
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingTop: 12, paddingBottom: 24 },
  emptyContainer: { flexGrow: 1, justifyContent: "center" },
});
