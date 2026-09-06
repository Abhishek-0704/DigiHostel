# Parent Mobile Application — Approval History (Phase 4, Prompt 10)

Real, backend-integrated, read-only Approval History module: a home list of every leave request tied to the authenticated parent's linked students (not just pending ones, unlike the Leave Approval list), a detail view, and a real chronological timeline built from the immutable `leave_approval_events` log — replacing the prior structural placeholder at `(tabs)/history.tsx`.

## 1. Architecture

Per ADR-015, `leave_requests` holds current state and `leave_approval_events` is the append-only, immutable event log meant to serve both the escalation timeline and a parent's approval-history view ("a parent's approval history view is simply a filtered/joined query over it"). Before this prompt, that intent had never been realized: no API route read `leave_approval_events`, and no client code existed for History. This module realizes it, adding exactly one narrow backend capability and otherwise composing entirely out of Leave Approval's existing, already-tested pieces.

No new table, no new RLS policy, no migration. No duplicate approval-history data model — `HistoryRecordPresentation` (`historyPresentationMapper.ts`) extends the existing `LeaveRequestPresentation` (imported from `leave-approval`, not copied), adding only `requestedAt`/`decidedAt`.

## 2. The one backend addition

**`GET /api/v1/leave-requests/{leaveRequestId}/events`** — read-only, identical authorization/anti-enumeration shape to the existing `GET /leave-requests/{leaveRequestId}` (owning student, or relationship-checked parent/guardian; 404 for both "doesn't exist" and "exists but unrelated"). Returns `LeaveApprovalEvent[]`, oldest first: `{id, eventType, response, biometricConfirmed, occurredAt}` — **deliberately omitting actor identity** (`actor_parent_id`/`actor_staff_id`) so no event ever reveals which specific parent/guardian/staff member acted. Implementation: `apps/api/src/domain/leave/repository.ts`'s `listEventsForLeaveRequest()`, `service.ts`'s `getEventsForParent`/`getEventsForStudent` (reusing `getForParent`/`getForStudent`'s already-tested relationship check rather than duplicating it), `routes/leave.ts`'s new route. Contract added to `packages/api-spec/openapi.yaml` and regenerated through Orval (`listLeaveRequestEvents`, `LeaveApprovalEvent`).

## 3. Capability Matrix

| Capability | Status | Notes |
|---|---|---|
| History list (all statuses) | **IMPLEMENTED** | Reuses the existing, already-real `GET /leave-requests` (`listForParent`) — it already returns every status, not only pending |
| Leave core fields (reason, dates, status, timestamps) | **IMPLEMENTED** | Same 8-field `LeaveRequestView`/`LeaveRequest` Leave Approval uses |
| Decision timestamp | **IMPLEMENTED (derived, truthful)** | `updatedAt` on a *terminal*-status row only (`approved`/`rejected`/`expired`) — no further mutation occurs after terminal, so it authoritatively is the decision time; `null` otherwise |
| Approval/escalation timeline events | **IMPLEMENTED** (new endpoint, §2) | `notified`/`responded`/`escalated`/`expired`/`manual_override` — the complete real vocabulary, nothing more |
| Student name/roll/hostel/room | **DEFERRED** | Unchanged from Leave Approval — never wired in this app |
| Leave type, destination, reference number | **NOT APPLICABLE** | No backend columns/concept exist |
| Expiry timestamp | **NOT AVAILABLE** | No field in the API response |
| Notification delivery events (parent-visible) | **NOT AVAILABLE** | No API route reads `notifications` at all, for anyone |
| Reception verification, academic approval, student exit/return | **NOT APPLICABLE** | No schema/enum representation whatsoever |
| Actor identity (which parent/guardian acted) | **DELIBERATELY NOT SURFACED** | Would reveal other linked parents/relationship type |
| Search | **IMPLEMENTED**, narrow | Client-side, against `reason` + status label only — student name/roll/leave type/destination aren't searchable because they aren't available at all (not a narrower-than-intended search, an honest one) |
| Filter | **IMPLEMENTED** | By status, limited to the real vocabulary (`awaiting_response`/`approved`/`rejected`/`expired` — no `cancelled`) |
| Sort | **IMPLEMENTED** | By requested date, decided date, or status — on raw timestamps, never formatted strings |
| Pagination | **PARTIALLY IMPLEMENTED** | See §7 |
| Realtime | **IMPLEMENTED** | Reuses `useLeaveRequestRealtime` unchanged |
| Offline read | **PARTIALLY IMPLEMENTED** | See §8 |

## 4. Screen Hierarchy

```
(app)/(tabs)/history        History Home  — list, search, filter, sort, pull-to-refresh, incremental load
(app)/history/[id]          History Detail — read-only record + timeline
```

`(tabs)/history` replaces the prior `PlaceholderScreen`. `history/[id]` is a new Stack route (registered in `app/(app)/_layout.tsx`), distinct from both the tab list and from `leave/[id]` (the active decision screen) — History never renders an approve/reject action. A record still in an awaiting-decision status shows its status plus a link to `/(app)/leave/[id]`, never a duplicated decision control.

## 5. Component Inventory

New: `HistoryCard`, `HistorySearchBar`, `HistoryFilterChips`, `HistorySortControl` (`src/features/approval-history/components/`).

Reused unchanged: `LeaveTimeline`, `StudentInformationSection`, `LeaveInformationSection`, `DetailRow` (all from `leave-approval`), `Card`, `Badge`, `SelectableChip`, `TextField`, `EmptyState`, `ErrorState`, `Skeleton`, `Loader`, `PageContainer`, `PageHeader`, `SectionHeader`, `OfflineBanner`. No duplicate of any of these was created.

## 6. Service/Query Architecture

`ApprovalService` (`src/services/approvals/approvals.ts`) gained one method, `getEvents(leaveRequestId)`, calling the new generated `listLeaveRequestEvents` — no second service class. Query hooks (`src/features/approval-history/hooks/`):

- `useApprovalHistory()` — the list, wrapping the same `approvalService.listForCurrentParent()` call `usePendingApprovals()` already makes, under its own query key (`["parent-mobile", "approval-history", "list"]`). Applies search/filter/sort client-side (see §7) and exposes an incrementally-windowed slice for the FlatList.
- `useHistoryRecordDetails(id)` — one record, mapped via `mapLeaveRequestToHistoryRecord` (adds `requestedAt`/`decidedAt` on top of the shared presentation).
- `useHistoryRecordEvents(id)` — the new events endpoint.

## 7. Pagination — Known Limitation

`GET /leave-requests` has no server-side pagination, filtering, or sorting (confirmed absent from both the OpenAPI contract and the route handler) — adding it would touch a contract Leave Approval's own `usePendingApprovals()` also depends on, which is out of this module's narrow-endpoint authorization. The full, already parent-scoped array is fetched once; search/filter/sort run in-memory over it, and `loadMore()` only reveals more of that already-fetched array to the FlatList — it never issues an additional network request. This is a real, accepted trade-off given the domain's naturally small dataset size (a parent's linked students' lifetime leave-request count), not a hidden one. **Future extension**: additive `?cursor`/`?limit`/`?status` query parameters on `GET /leave-requests`.

## 8. Offline Strategy — Known Limitation

Read-only always; no write path exists here. Within a session, TanStack Query's default behavior (`retry: false` on these queries, but `data` is retained across a failed background refetch) means already-loaded History remains visible if connectivity drops mid-session — no extra code was needed for this. **It is not durable across an app restart** — `src/lib/queryClient.ts` has no persister (`AsyncStorage`/`persistQueryClient`) anywhere in this app; adding one would be new app-wide infrastructure, out of this module's scope. `OfflineBanner` (existing, reused) surfaces the real `status === "offline"` state.

## 9. Realtime Synchronization

`useLeaveRequestRealtime` (built in Prompt 9B, unchanged) is reused as-is on both screens — unfiltered on History Home (mirrors the Leave Approval list's own reasoning: RLS scopes visibility, no cheap client-side filter value exists), filtered to `id=eq.<id>` on History Detail (refreshes both the record and its events query on any change). No second realtime architecture, no duplicate subscription pattern.

## 10. Security / Privacy

- Parent isolation: unchanged — the same `parent_student_relationships` check `getForParent`/`decide` already use, reused by the new events endpoint rather than duplicated.
- No client-created authoritative history — every displayed fact comes from a real backend read; the client performs no writes.
- No internal identifiers exposed — `HistoryCard` never renders `record.id` as visible text (opaque navigation key only), matching `LeaveRequestCard`'s existing convention.
- No actor identity ever surfaced (§2).
- Error handling reuses `mapLeaveApprovalError` — never a raw backend message/code.

## 11. Testing

Pure-logic unit tests (Vitest): `historyPresentationMapper.test.ts`, `historyTimeline.test.ts` (chronological ordering, no fabricated events, exhaustive event-type/response label coverage), `historySearch.test.ts`, `historyFilter.test.ts`, `historySort.test.ts` (raw-timestamp ordering, non-mutation). Backend: `apps/api/src/routes/leave.test.ts` gained a dedicated `describe` block for the new route (student/parent/unrelated-parent/staff authorization, ordering, actor-field redaction); `apps/api/src/domain/leave/repository.integration.test.ts` gained two real-Postgres tests for `listEventsForLeaveRequest`.

Not tested: component/screen rendering (this app has no RN-aware test runner — unchanged, pre-existing limitation shared with every other feature in this app).

## 12. Native/Device Verification

Not performed — no Android/iOS device or emulator available in this environment (unchanged limitation). Substituted: `expo export --platform android` (clean) and `expo-doctor` (18/18), plus a manual reasoning-level trace of the History Home → search/filter/sort → Detail → Timeline flow through the actual code.

## 13. Future Extensions

Server-side pagination/search/filter on `GET /leave-requests` (§7); durable offline persistence (§8); student/hostel/room enrichment once wired (would flow through automatically — `HistoryCard`/`StudentInformationSection` already render `student` when populated); notification-delivery and reception-verification timeline items, if and when a backend source for them is built.
