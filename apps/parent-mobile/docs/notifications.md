# Parent Mobile Application — Notification System (Prompt 8)

This document covers the Notification System implemented in Prompt 8 (Phase 4). It follows `docs/foundation.md`'s conventions and `docs/authentication.md`'s established patterns (real capability alongside honest fail-closed placeholders) — see `docs/foundation.md` §14 for the cross-reference.

## 1. Backend Capability Matrix

Established by direct inspection (schema, RLS, `apps/api/src/routes/`, `packages/api-spec/openapi.yaml`, the generated client, the notification worker) before any client code was written, per this prompt's mandatory reconnaissance order.

| Capability | Status | Evidence |
|---|---|---|
| Read the parent's own notifications | **IMPLEMENTED** | `notifications` table has a real RLS SELECT policy scoped to the caller (`notifications_select_own_parent`/`_own_student` — `packages/db/src/schema/notification.ts`). No Fastify route wraps it, but the same direct-Supabase-client pattern `deviceService.listTrustedDevices()` already established (Prompt 3/6) applies unchanged. |
| Notification title/body text | **MISSING (by design)** | The table stores no text at all — only structural columns (`recipient_type`, `recipient_id`, `related_leave_request_id`, `related_library_pass_id`, `stage`, `status`, `retry_count`, `sent_at`, `delivered_at`, `created_at`). Real push text is built server-side, per send, from the student's name (`apps/api/src/workers/notificationContent.ts`), which this app has no way to fetch (see §2). |
| Notification categories (Security/Emergency/Health/Hostel Updates/Announcements/System) | **NOT APPLICABLE** | Zero backend representation of any kind — no column, no enum value. Only `related_leave_request_id` (→ "Leave Approvals") and `related_library_pass_id` (→ "Library", schema-ready but never populated — no library workflow exists anywhere in this backend) can ever be real. |
| Mark as read / unread state | **MISSING** | No read/unread column exists on `notifications` at all. No RLS UPDATE grant for `authenticated`. No Fastify endpoint. |
| Delete / Archive | **MISSING** | No RLS DELETE grant for `authenticated`, no Fastify endpoint. |
| Mark All Read | **MISSING** | Depends on the (missing) single mark-as-read capability. |
| Push token registration | **MISSING** | `trusted_devices.expo_push_token` (the column the notification worker actually reads — `apps/api/src/domain/notification/repository.ts`'s `getPushTokensForRecipient`) has no Fastify endpoint to write it through. `trusted_devices` does have an RLS UPDATE policy (`trusted_devices_revoke_own`) that would technically permit a raw client UPDATE, but this app deliberately never performs backend-owned device mutations as raw RLS writes — the same principle `deviceService.registerCurrentDevice()`/`revokeDevice()` already establish (Prompt 4B). Classified MISSING, not merely unwired. |
| Push delivery (server → device) | **IMPLEMENTED (server-side only)** | `apps/api/src/lib/push/expoPush.ts`'s `ExpoPushSender` sends real Expo pushes today — but only ever to a token that was written to `trusted_devices.expo_push_token`, which (per the row above) nothing can currently do. No push has ever reached a real device in this repository's history (unchanged fact from `docs/current-state.md`). |
| Push payload / deep-link data | **MISSING** | `ExpoPushSender.send(tokens, title, body)` sends only `{ to, title, body }` — no `data` field. No real push this backend sends today can deep-link anywhere. |
| Realtime Postgres Changes on `notifications` | **IMPLEMENTED (F-08 correction)** | ADR-009 accepts this architecture; `notifications` was added to the `supabase_realtime` publication by `supabase/migrations/0002_realtime_publication.sql` (Prompt 9B, after this document was originally written) — this row was stale until the F-08 audit corrected it. Confirmed via `supabase/tests/database/11_realtime_publication.sql` and, separately, live end-to-end on Render staging (`docs/observability.md`/F-06-F-07). See §7. |
| Get a specific leave request's details (reason/dates/live status) | **IMPLEMENTED, but explicitly not used here** | `GET /leave-requests/{id}` is real and parent-accessible (`docs/api-contract.md`), and `@digihostel/api-client-react` has a real generated hook for it. Not called from the Notification Details screen — `src/services/approvals/approvals.ts`'s own doc comment already reserves this exact wiring for "the leave-approval feature prompt" (Prompt 9), and this prompt's scope_guard excludes leave-approval business logic. See §9. |

## 2. Notification Architecture Summary

```
notifications (Postgres table, RLS-scoped)
        │  direct Supabase client read (mirrors deviceService's pattern)
        ▼
notificationService.listNotifications()   — src/services/notifications/notifications.ts
        │  raw row → ParentNotification view
        ▼
mapRowToNotification()                    — src/features/notifications/notificationClassification.ts
        │
        ▼
useNotificationCenter()  (TanStack Query) — src/hooks/useNotificationCenter.ts
        │  + local search/filter/sort (pure functions) + realtime invalidation
        ▼
Notification Center / Notification Details screens
```

No competing notification architecture was introduced. No Redis. No second realtime abstraction (`src/services/supabase/realtime.ts`'s existing `createChannel`/`removeChannel` is reused unchanged). No second API client. No new backend orchestration.

## 3. Why The Row Alone Cannot Carry Personalized Content

`buildLeaveNotificationContent()` (server-side) personalizes the real push body with the student's name and roll number. This app has **no** way to fetch that: no `/profile` route, no `services/students`, no student name available anywhere in the Parent Mobile architecture (unchanged from `docs/foundation.md` §13's Student Summary boundary). `notificationContent.ts`'s `buildNotificationDisplayContent()` therefore:

- reuses the backend's **exact, already-approved static title** ("Leave request awaiting your response") — honest consistency, not a guess, since that title is identical regardless of stage/student on the server side too;
- uses a deliberately generic description instead of a personalized one.

## 4. Screen Hierarchy

```
(app)/(tabs)/notifications        Notification Center   — real list, search, filter, sort, realtime, pull-to-refresh
(app)/notifications/[id]          Notification Details   — looks up from the same cached list; safe deep-link target
(app)/notifications/settings      Notification Settings  — placeholder; real permission status, no persisted preferences
```

State-driven UI is used throughout (loading/empty/error states are conditional renders, not separate routes), per this prompt's own "avoid unnecessary route proliferation" instruction — exactly two new routes were added, matching the two screens this prompt's `<screen_scope>` names as needing their own route (Details needs a dynamic `[id]`; Settings is a legitimately separate, linkable destination from the Center's header action).

## 5. Component Inventory

New, reusable:
- `src/features/notifications/components/NotificationCard.tsx` — category/priority badges, title, description, timestamp, delivery-status note; never renders an internal id.
- `src/components/ui/SelectableChip.tsx` — generic selectable pill (filter/sort chip row); placed in `components/ui` (not notifications-specific) since it has no domain knowledge.
- `src/features/notifications/components/NotificationDeepLinkHandler.tsx` — renders nothing; mounts tap-routing once at the root.

Reused, not duplicated: `Card`, `Badge`, `Button`, `TextField` (search input), `Divider`, `EmptyState`, `ErrorState`, `Skeleton`, `Loader`, `PageContainer`, `PageHeader` (its Prompt 7 `actions` capability gets its first real consumer here — the Center's "Settings" header action), `SectionHeader`.

Deliberately **not** built as separate components, per this prompt's own "do not create six abstraction layers" instruction: `PriorityBanner` (the card's left-accent border + "High priority" `Badge` already covers this), `CategoryChip` (`Badge` already covers static category display; `SelectableChip` covers the interactive filter case — a third, near-identical component would be duplication), `FilterSheet`/`SortSheet` (no `Dialog`/`BottomSheet` exists in this app yet — building one merely for this would be exactly the "add a dependency/abstraction without evidence it's needed" this prompt warns against; two horizontal `SelectableChip` rows serve the same purpose with existing primitives), `NotificationTimeline` (no safe, non-escalation-revealing timeline data exists beyond "received" + "delivery status," both already shown as simple detail rows).

## 6. Services

| Service | Responsibility | Status |
|---|---|---|
| `notificationService` (`src/services/notifications/notifications.ts`) | List notifications; push permission status/request; push-token capability probe; push-token registration | List/permission/token-probe REAL; registration fail-closed (§1) |
| `notificationActionsService` (`src/services/notifications/notificationActions.ts`) | Mark as read, mark all read, delete, archive | All fail-closed — `NotificationActionNotSupportedError` (§1) |

No `NotificationBadgeService`/`NotificationSearchService`/`NotificationSyncService`/`NotificationCacheService` were created — search/sort/filter/badge derivation are pure functions (§8), not services (nothing async or stateful about them), and there is no real sync/cache layer to wrap (§10).

## 7. State Management

`useNotificationCenter()` (`src/hooks/useNotificationCenter.ts`) is the single hook both notification screens read from:

- **Server state (TanStack Query):** the notification list (`NOTIFICATIONS_QUERY_KEY`), mirroring `useDevice()`'s established pattern (Prompt 6) exactly — a plain Supabase-backed service wrapped in `useQuery`, not the generated REST client.
- **Local, ephemeral UI state:** `searchQuery` (debounced 250ms via the existing `useDebounce`), `filter`, `sortOrder` — plain `useState`, applied via pure functions (`searchNotifications` → `filterNotifications` → `sortNotifications`) inside a `useMemo`. Never a second network round-trip.
- **Mutation state:** one `useMutation` wrapping all four notification actions — always rejects (§1); `actionError` carries the mapped, safe message.
- **Realtime connection state:** `useNotificationRealtime()`'s own `"connecting" | "connected" | "disconnected" | "unavailable"`, surfaced as a small subtitle on the Center's header.

No new global store. `NotificationContext` (Prompt 2 placeholder) became real push-permission state in this prompt — the existing context, not a second one.

## 8. Realtime Integration

`src/hooks/useNotificationRealtime.ts` reuses `src/services/supabase/realtime.ts`'s existing `createChannel`/`removeChannel` — no new realtime abstraction. One subscription for the whole `notifications` table (`postgres_changes`, `event: "*"`), **no client-side filter**: there is no reliable way for this client to know its own `parents.id` (resolved server-side via a SECURITY DEFINER lookup, not equal to the Supabase Auth user id — `packages/db/src/schema/rls-helpers.ts`), so RLS alone scopes which change events this client actually receives — simpler and correct, not a workaround. On any change, the hook simply invalidates the TanStack Query cache (triggering a refetch) rather than attempting to merge a partial payload — the simplest safe reconciliation strategy for a first implementation.

**Correction (F-08 audit, see §1):** this row previously stated no migration added `notifications` to the realtime publication. That was true when this document was first written but has been stale since Prompt 9B — `supabase/migrations/0002_realtime_publication.sql` added it, and change-event delivery is now covered by a pgTAP assertion (`supabase/tests/database/11_realtime_publication.sql`) plus live staging verification (F-06/F-07). Pull-to-refresh remains a reliable fallback regardless of realtime status, and the app-foreground catch-up refetch added by F-08 (`apps/parent-mobile/src/lib/queryClient.ts`) provides an additional safety net independent of the realtime channel's own reconnect timing.

## 9. Push Notification Integration

`expo-notifications` (`~0.32.17`) was added — the one new dependency this prompt introduces, SDK 54-compatible (`npx expo install`). Real, working today (in this environment, without a remote push ever having been sent):

- Foreground notification handler (`Notifications.setNotificationHandler`) — banner+list, no sound/badge (no sound asset, no verified badge source).
- Permission check/request (`getPermissionsAsync`/`requestPermissionsAsync`) — surfaced in `NotificationContext` and the Notification Settings screen.
- Push-token capability probe (`getExpoPushTokenAsync`) — an explicit, on-demand "Check push capability" action in Settings (never auto-triggered, since it's a real network call to Expo's push service). Requires an EAS `projectId` (`app.json`/`app.config`'s `extra.eas.projectId`) — **not configured in this repository** (no EAS setup exists), so this probe honestly reports "unavailable" in this environment; it never throws.
- Notification-response (tap) listener + cold-start check (`addNotificationResponseReceivedListener` / `getLastNotificationResponseAsync`) — wired once at the root via `NotificationDeepLinkHandler` (§10).

**Not claimed as production-ready** (per this prompt's explicit instruction): push credentials, EAS project configuration, and backend token registration (§1) are all missing, so no push can currently reach a device end-to-end, and remote Android push additionally requires a development build rather than Expo Go on SDK 54 — not attempted, since no dev build exists in this environment. Nothing here ever logs a token, payload, or auth header (matches this app's existing logger discipline).

## 10. Deep-Link / Navigation Summary

`src/features/notifications/notificationDeepLink.ts`'s `resolveNotificationDeepLink()` validates an untrusted payload (an `expo-notifications` `data` field, or a payload this app constructs itself) and produces **only** an in-app `Href` into the already-`AuthGate`-protected `(app)` group — never an external URL, never a claim of authorization. `useNotificationDeepLinkRouting()` (mounted via `NotificationDeepLinkHandler` in `app/_layout.tsx`) handles foreground/background taps (the listener) and cold-start taps (`getLastNotificationResponseAsync`), deduplicates by response id, and **defers navigation until `useAuth().status === "authenticated"`** — a tap arriving before sign-in is queued, not dropped, and never bypasses `AuthGate`.

Today, real in-app deep-linking works from a Notification Center card tap (constructed from a real, already-fetched `ParentNotification` — no push payload needed). OS-push-tap deep-linking is architecturally complete but has nothing to validate yet, since no real push carries a `data` payload (§1) — this is ready the moment the backend adds one, with no client redesign required.

The destination itself (`leave/[id]`) remains the existing, still-placeholder Approval Details screen — not invented or expanded here, per this prompt's explicit rule.

## 11. Badge Strategy

**No numeric badge is shown anywhere** (bottom tab or app icon) — a deliberate, considered decision, not an oversight. `src/features/notifications/notificationBadge.ts`'s `deriveNotificationBadge()` exists and is tested (the four required cases: zero/one/multiple/unavailable) for future use, but its output is a **total** notification count, not an "unread" count: `isUnread()` (`notificationClassification.ts`) is always `true` today — there is no read-state persistence of any kind (§1) — so a badge based on it would never shrink, which would functionally read to a real user exactly like the "fake perpetually-stuck badge" this prompt explicitly warns against, even though the underlying number is technically real. Keeping Prompt 7's existing "no badge" decision unchanged was judged the more honest choice than displaying a monotonically-growing number under an "unread" implication it cannot support.

## 12. Offline Strategy

TanStack Query's in-memory cache (already the default for every other list in this app) means the Center shows previously-fetched notifications immediately on revisit within the same app session — real, not fabricated, but **not** a persistent offline cache: nothing survives an app restart, since `expo-sqlite` is not installed (unchanged from `docs/foundation.md` §10 — no queue implementation exists to justify it yet). No second offline database was created; no existing offline architecture (there isn't one beyond `NetworkContext`'s honest `"unknown"` stub) was bypassed.

Because no mutation (§1) is real, there is nothing to queue for later sync — `NotificationActionNotSupportedError` fires identically online or offline. This is the simplest possible honest offline story: read access degrades gracefully to "last successfully fetched," write access is uniformly unavailable regardless of connectivity.

## 13. Testing

**Pure-logic (Vitest, this app's only test runner — no component/screen rendering test exists here or anywhere else in this app; `jest-expo`/`@testing-library/react-native` remains a deliberately not-yet-made decision, `docs/foundation.md` §11):**

- `notificationClassification.test.ts` (23 tests) — category/priority derivation, actionability, `isUnread`, row validation, content mapping.
- `notificationContent.test.ts` (3) — copy correctness, no student-name leakage.
- `notificationSearch.test.ts` (6) — title/description/category/status matching, case-insensitivity, empty query.
- `notificationFilters.test.ts` (6) — unread/read/high-priority/category filters, including a category with no real data.
- `notificationSorting.test.ts` (7) — newest/oldest/priority/category/unread-first, determinism, non-mutation.
- `notificationBadge.test.ts` (4) — the four required cases.
- `notificationDeepLink.test.ts` (7) — supported/unsupported/invalid/malformed payloads, no external URL ever produced.
- `notificationFormatting.test.ts` (3) — timestamp formatting, safe fallback.

**Deliberately not tested identically to the prompt's literal list, with reasons:** "student matching" in search — no student-name field exists anywhere in this app's data (§3), so there is nothing real to test a match against; documented in `notificationSearch.ts`'s own doc comment rather than silently omitted. Synchronization success/failure/retry/rollback — no real synchronization API exists (§1); `NotificationActionNotSupportedError`'s always-reject behavior is what `notificationActions.ts`'s own construction guarantees, not something requiring a dedicated test beyond the type system.

**Full regression:** the complete existing Parent Mobile suite passes unchanged, plus these new files — no existing test was weakened, skipped, or deleted.

## 14. Native / Device Verification

**Not performed** — no Android emulator or physical device was available in this sandbox (`adb devices` empty), and no local Supabase/Docker stack was running (`docker ps` failed to connect), consistent with every prior prompt's exhaustively-diagnosed environment limitation (`docs/authentication.md` §14, `docs/foundation.md`'s prior native-verification notes). Consequently:

- Real remote push delivery was not attempted (also blocked structurally — §1/§9 — independent of environment).
- Realtime change-event delivery end-to-end was not confirmed (§8).
- On-device accessibility (screen reader) verification was not performed.

**Automated verification performed instead:** full typecheck (workspace-wide), lint, format, the complete test suite (including the 59 new tests above), `expo export --platform android` (a real Metro bundle, 1321 modules, no errors), and `expo-doctor` (18/18 checks passed).

## 15. Future Extensibility

- Adding a real backend `PATCH /notifications/{id}/read` (or similar) would slot into `notificationActionsService`'s existing interface with no consumer-side redesign — every screen already calls through it.
- Adding real backend categories (a `category` column, say) would only require extending `deriveCategory()`'s mapping — the full taxonomy, filter UI, and `CATEGORY_LABELS` already exist.
- Adding the missing realtime publication (§1/§8) requires zero client changes — the subscription is already correct.
- Adding a push `data` payload server-side makes `resolveNotificationDeepLink()`/`useNotificationDeepLinkRouting()` immediately functional for OS-tap deep-linking, with no client redesign.
- A future push-token-registration endpoint only requires implementing `notificationService.registerPushToken()`'s body — the capability probe (`getPushToken()`) it would call already exists and is real.
