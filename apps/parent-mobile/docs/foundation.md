# Parent Mobile Application — Foundation

This document covers the project foundation implemented in Prompt 2 (Phase 1). It is the reference for conventions future feature prompts should follow — it does not describe any business feature, because none exists yet in this app.

See `docs/current-state.md` (repo root) for the backend's current, verified capabilities, and the Prompt 1 planning document (this conversation) for the full architecture analysis this foundation implements.

## 1. Architecture

React Native + Expo + TypeScript + Expo Router (ADR-001, ADR-004). Business data flows `Screen → feature hook → @digihostel/api-client-react (generated) → Fastify REST API → Postgres`. Session/auth flows `Screen → Supabase client SDK` directly (ADR-014) — never through Fastify for session management, and Fastify is never bypassed for business data.

No business logic (leave decisions, authorization, escalation) lives in this app — all of that remains backend/database-authoritative, per ADR-014/ADR-016.

## 2. Folder Structure

```
app/                          Expo Router route tree — routing only, no business logic
  (auth)/                     Welcome, Login, OTP — unauthenticated
  (onboarding)/                Device trust setup — post-OTP, pre-dashboard
  (app)/                       Authenticated shell
    (tabs)/                    Home (Dashboard), Notifications (Notification Center — Prompt 8), History, Profile — primary bottom nav (Prompt 7)
    leave/[id]                 Approval Details
    notifications/[id]         Notification Details (Prompt 8)
    notifications/settings     Notification Settings placeholder (Prompt 8)
    security/, settings/, help/, about/

src/
  components/{ui,feedback,layout}/  Shared, reusable, no business logic
  config/                      Typed env access
  constants/                   Shared literal registries (storage keys, etc.)
  contexts/                    App-wide React Context providers
  features/                    One directory per future feature module (empty until that feature is built)
  hooks/                       Reusable hooks (theme, network, session, auth, debounce, and service-wrapper hooks)
  lib/                         Infra glue (QueryClient factory)
  navigation/                  Route-protection logic (AuthGate + its pure routeGuard decision logic — Prompt 3)
  providers/                   AppProviders — the single composition root
  services/                    Service abstractions (Supabase, storage, logger, device identity, biometric — real, Prompt 5; device/notification/approval placeholders)
  styles/                      Design tokens + typography scale
  types/                       App-local shared types (error taxonomy)
  utils/                       Pure, framework-agnostic helpers
```

**Consolidation from the originally proposed skeleton:** `components/common/` and `components/navigation/` were folded into `components/layout/` — neither had genuinely distinct content once the actual foundation pieces were built (see `src/components/index.ts`'s doc comment). Split them back out if a future feature needs content that doesn't fit `layout/`. **This is unrelated to** the top-level `src/navigation/` directory added in Prompt 3 — that one holds route-*protection logic* (no UI components at all), not navigation-chrome components, so it doesn't reopen the consolidation decision above.

`features/*` directories are intentionally not created in this pass — no feature has real code yet, and empty directories created merely to match a proposed skeleton were avoided per this prompt's own instruction.

## 3. Routing Conventions

Expo Router, file-system based, `typedRoutes` experiment enabled (`app.json`) for compile-time route-name/param checking. Route groups follow auth state boundaries: `(auth)` → `(onboarding)` → `(app)`. **Route protection is now real (Prompt 3)** — see `docs/authentication.md` §6 for `AuthGate`'s redirect logic; this is a UX/navigation mechanism only, never the actual security boundary.

Every screen created in *this* (Prompt 2) pass was a structural placeholder (`PlaceholderScreen` component) — none contained business logic, matching this prompt's explicit scope boundary. **As of Prompt 4A, `(auth)/{welcome,login,otp}` and `app/index.tsx` (Splash) are real, functional screens** — see `docs/authentication.md` §13. **As of Prompt 4B, `(onboarding)/devices`, `(app)/security/[deviceId]` (new), and `(app)/security/tips` (new) are also real** — see `docs/authentication.md` §15. **As of Prompt 5, `(app)/security/biometric` (new) is also real** — see `docs/authentication.md` §16. **As of Prompt 6, `(app)/security/index` was rebuilt as the Security Center Home (a dashboard, no longer the device list directly), and `(app)/security/devices` (new) now holds the Trusted Devices List that previously lived at `security/index`** — see `docs/authentication.md` §17. **As of Prompt 7, `(app)/(tabs)/index` (Home) is a real, fully-composed dashboard, and the standalone `(app)/history` stack route was removed in favor of `(app)/(tabs)/history` — History is now a primary bottom-tab destination, not a separately-pushed screen** — see §13 below. **As of Prompt 8, `(tabs)/notifications` (Notification Center) and the new `notifications/[id]` (Notification Details) and `notifications/settings` (placeholder) are also real** — see §14 below. Every other route (`(tabs)/profile`, `settings`, `help`, `about`, `leave/[id]`) remains a `PlaceholderScreen`, out of scope until its own prompt.

## 4. Configuration / Environment Conventions

Only `EXPO_PUBLIC_`-prefixed variables are used (Expo's own convention for client-bundle-safe values — see `env.example`). `src/config/env.ts`'s `getEnv()` validates lazily, at first point of use, not at app startup, so the app remains bootable without a configured `.env`.

**Naming-mismatch resolution (Prompt 1's flagged risk):** `@digihostel/api-client-react`'s fetch mutator was changed from reading an unprefixed `API_BASE_URL` to `EXPO_PUBLIC_API_BASE_URL` — the unprefixed form would never actually reach the compiled app bundle. This is the one convention; do not introduce a second one.

Never add a non-`EXPO_PUBLIC_` variable to this app's `env.example` or `.env` — those are backend-only and belong solely to the repo root's `env.example`.

## 5. Theme / Design-Token System

`src/styles/tokens.ts` — semantic color roles (not literals), spacing/radii/icon-size/motion/elevation scales, light and dark palettes. `src/styles/typography.ts` — a nine-step type scale using the platform system font (no custom font bundled). `ThemeContext` resolves `system | light | dark` preference (persisted via `expo-secure-store`, chosen to avoid a second storage dependency) against `react-native`'s `useColorScheme`. Every shared component reads colors/spacing from `useTheme()`, never a hardcoded literal.

## 6. Shared Component Conventions

`src/components/ui` (Button, Card, TextField, Badge, Divider, **OTPInput — Prompt 4A**, **SecurityInformationCard — Prompt 4B, relocated here in Prompt 5**, **SectionHeader — Prompt 7**, **SelectableChip — Prompt 8**), `src/components/feedback` (Loader, Skeleton, EmptyState, ErrorState, **SuccessState — Prompt 4B**, ErrorBoundary), `src/components/layout` (PageContainer, PageHeader, ScrollContainer, OfflineBanner, PlaceholderScreen). All are strongly typed, own no business logic, and read every visual value from the design tokens. Dialog, BottomSheet, Avatar, Chip, Snackbar, SearchBar, and a dedicated IconButton/NavigationBar were deliberately not built — no current screen needs them; add them when a real consumer exists.

**Prompt 7 addition — `PageHeader` extended, not replaced:** `onBackPress` and `actions` are new optional props (see §13 below and the component's own doc comment) — every existing call site is unaffected (both default to `undefined`, rendering exactly as before). This satisfies Prompt 7's "reuse the existing header, don't build a second one" instruction.

**Prompt 4B addition — feature-owned components:** `src/features/devices/components/` (`DeviceCard`, `DeviceStatusBadge`, `SecurityBanner`) — device-domain composites built from the generic primitives above, not generic themselves (each takes a `TrustedDeviceSummary` or device-specific prop), so they live with the feature's own logic rather than in `components/ui`. `SecurityInformationCard` originally lived here too but was relocated to `components/ui` in Prompt 5 once a second feature (biometric) needed the identical renderer — see `docs/authentication.md` §15/§16.

**Prompt 5 addition — feature-owned components:** `src/features/biometric/components/` (`BiometricStatusCard`, `BiometricMethodBadge`) — same rationale as the devices feature's own components. See `docs/authentication.md` §16 for the full inventory, including which suggested components (`BiometricPrompt`, `RegistrationProgress`-equivalents, a dedicated `BiometricErrorState`/`BiometricSuccessState`) were deliberately not built and why.

## 7. Service-Layer Conventions

Every service is an interface + one implementation, mirroring the backend's own honest-placeholder discipline (`apps/api/src/lib/auth/security-gates.ts`'s `NotImplementedAttestationGate` pattern):

| Service | Status | Note |
|---|---|---|
| `services/supabase` | Real — session lifecycle **and phone-OTP send/verify** (Prompt 3) | See `docs/authentication.md`; no roll-number pre-check (backend gap) |
| `services/storage` (secure storage) | Real | `expo-secure-store` wrapper |
| `services/logger` | Real | Thin `console` wrapper, swappable later |
| `services/deviceIdentity` | Real (Prompt 3) | App-generated UUID via `expo-crypto`, never a hardware identifier |
| `services/biometric` | **Real (Prompt 5)** | `expo-local-authentication`-backed; capability detection, authentication, and action-bound step-up assertions. See `docs/authentication.md` §16 |
| `services/devices` | **Partial (Prompt 3, extended Prompt 4B)** — full list (active + revoked) real, RLS-verified, with a genuinely-derived `isCurrentDevice`; registration/revocation still fail-closed | See `docs/authentication.md` §5/§15 for exactly why each half is or isn't implemented |
| `services/notifications` | **Partial (Prompt 8)** — `listNotifications()`, `getPermissionStatus()`/`requestPermission()`/`getPushToken()` real; `registerPushToken()` still fail-closed | See `docs/notifications.md`'s capability matrix |
| `services/approvals` | Placeholder, throws | Backend contract IS ready; wiring deferred to the leave-approval feature prompt (Prompt 9) by this prompt's own scope boundary |
| `services/api` | Real (re-export) + **auth-token wiring (Prompt 3)** | Thin indirection over `@digihostel/api-client-react`; `authTokenProvider.ts` attaches the Supabase session to every generated-client request |

Never treat a placeholder's eventual real implementation as sufficient proof for a security decision by itself — the server remains authoritative regardless of what the client believes.

## 8. State-Management Conventions

Server state: TanStack Query — originally only via the generated hooks re-exported from `services/api`; **as of Prompt 6, `useDevice()` also uses `useQuery`/`useMutation` directly against `deviceService`** (a plain Supabase-backed service, not the generated Fastify client) — TanStack Query wraps any async data source, not only REST calls, and this removed a real, previously-flagged inefficiency (Prompt 4B quality-gate finding PERF-001: independent per-screen re-fetching with no shared cache). **As of Prompt 8, `useNotificationCenter()` follows the same pattern** for `notificationService.listNotifications()`, with Supabase Realtime invalidating the same query — see `docs/notifications.md` §7. Client-only state: local component state (search/filter/sort in `useNotificationCenter()` are local `useState`, derived via pure functions, never a second server round-trip). Cross-cutting concerns get a Context (`ThemeContext`, `NetworkContext`, `SessionContext`, `NotificationContext`) — nothing else; `NotificationContext` became real push-permission state in Prompt 8 (previously a fixed placeholder). No global state library beyond TanStack Query + Context; none is justified by the accepted architecture.

## 9. Error-Handling Conventions

`src/types/errors.ts`'s `AppError`/`toAppError()` mirrors the backend's G-01 sanitization discipline: a fixed, small set of safe, pre-approved user-facing messages; the original error is kept only as `cause`, for logging, never rendered. `ErrorState` renders `error.userMessage` exclusively. `ErrorBoundary` is the last-resort render-time catch, styled with static values (not theme tokens) so it survives even a provider failure.

## 10. Offline Foundation

Prepared, not implemented: `NetworkContext` exposes a stable `"unknown" | "online" | "offline"` shape with no real detector wired up yet (no `@react-native-community/netinfo`/`expo-network` dependency added — a deliberate, undecided choice, not an oversight). `OfflineBanner` exists as a visual slot that currently never renders. `src/utils/async.ts`'s `withRetry` is generic retry infrastructure, not wired to any specific mutation. `expo-sqlite` is intentionally not installed — no queue implementation exists to justify it yet (ADR-008's actual offline queue is a future prompt's work).

## 11. Testing Conventions

Pure-logic modules (no `react-native`/`expo-router` import) are unit-tested under the repo's existing Vitest setup — `vitest.config.ts`'s include glob now also covers `apps/parent-mobile/src/**/*.test.ts`. Component/screen testing needs a React-Native-aware test runner (`jest-expo` + `@testing-library/react-native` is the Expo-recommended combination) — **not installed in this pass**, a deliberate open decision, not a silent gap.

**Prompt 3 addition:** `*.integration.test.ts` files construct their own plain `@supabase/supabase-js` client (not the app's `expo-secure-store`-dependent one) and run real queries against the local Supabase instance, gated by `SUPABASE_URL`/`SUPABASE_ANON_KEY` env vars (skip gracefully when unset, same convention as `apps/api`'s `DATABASE_URL`-gated suite). Use real `supabase/seed.sql` fixtures — never invent test data outside it.

## 12. Development Conventions

- `pnpm --filter @digihostel/parent-mobile <script>` from the repo root, or run scripts from within `apps/parent-mobile/`.
- Use `npx expo install <package>` for any Expo/React-Native-ecosystem dependency (SDK-compatible version resolution), plain `pnpm add` for everything else.
- Absolute imports from route files use the `@/` alias (`@/src/...`); files within `src/` use relative imports.
- Every new dependency must be justified against the accepted architecture (ADR-004/007/008/009/010/014) before being added — do not install "for later."
- **`metro.config.js` (Prompt 3):** required for Metro to resolve workspace packages that use TypeScript's NodeNext `.js`-extension-imports-a-`.ts`-file convention (`@digihostel/api-client-react`, `@digihostel/api-zod`). Do not delete it — a full `expo export` (this repo's standard buildability check) will fail without it the moment any code imports those packages' internals, as it did during this prompt's own implementation until the fix landed.

## 13. Application Shell & Home Dashboard (Prompt 7)

**Route hierarchy.** The authenticated shell's primary navigation is now four bottom tabs — `(app)/(tabs)/{index,notifications,history,profile}` — matching this prompt's `<bottom_navigation>` instructions (Home, Notifications, History, Profile). `history` moved from a standalone `(app)/history` Stack route into `(tabs)` in this prompt; its Stack.Screen registration was removed from `app/(app)/_layout.tsx` accordingly. `leave/[id]` (Approval Details) and `security/*`, `settings`, `help`, `about` remain Stack-pushed routes outside the tab bar, unchanged.

**Bottom navigation.** `app/(app)/(tabs)/_layout.tsx` — no icon library (unchanged foundation decision, §6/§12); labels only, each with an explicit `tabBarAccessibilityLabel`. No `tabBarBadge` is set anywhere: there is no authoritative unread-count source (`NotificationContext.permissionStatus` is a fixed `"unavailable"` — see §7's service table), and this prompt's own instructions forbid a fabricated badge count.

**Global header.** `PageHeader` (`src/components/layout/PageHeader.tsx`) was extended, not replaced, with two new optional props: `onBackPress` (renders a back button) and `actions` (a small right-aligned row of text actions). Neither is consumed by any screen in this prompt — every `(tabs)` screen is a navigation root with no "back" semantics, every Stack-pushed screen already gets a native back button via `headerShown: true`, and Home deliberately does not duplicate Notifications/Profile as header buttons since the four-tab bar already provides that navigation. The capability exists for a future screen that needs it (e.g. a non-tab screen rendering its own header without a native Stack header) without requiring a second header component.

**Home Dashboard hierarchy** (`app/(app)/(tabs)/index.tsx`, composed from `src/features/dashboard/components/`):

```
Home
├── Welcome Header      — WelcomeHeader.tsx        — generic greeting + today's date
├── Student Summary     — StudentSummaryCard.tsx    — UNAVAILABLE (no student data source exists)
├── Pending Actions     — PendingActionsCard.tsx    — UNAVAILABLE (leave approval fetching out of scope)
├── Security Status     — SecurityStatusSection.tsx — REAL (reuses Prompt 6's useDevice/useBiometric/deriveProtectionSummary)
├── Quick Actions       — QuickActionsSection.tsx   — REAL (navigates to already-implemented routes)
├── Recent Activity     — RecentActivitySection.tsx — UNAVAILABLE (no backend activity feed — same audit_logs RLS evidence as Prompt 6's DEVICE_ACTIVITY_UNAVAILABLE)
└── Future Insights     — FutureInsightsSection.tsx — UI-only "Coming soon" tiles, no computed values
```

**Real vs. placeholder data — the explicit boundary this prompt requires:**

| Section | Status | Why |
|---|---|---|
| Welcome Header | Real, but generic | No parent-display-name source exists anywhere in this app (no `/profile` route implemented — `docs/api-contract.md`); greeting never invents a name |
| Student Summary | Unavailable | No `services/students` (or equivalent) exists; no backend route surfaces linked-student data to the Parent app yet |
| Pending Actions | Unavailable | `services/approvals/approvals.ts`'s `approvalService` is a fail-closed placeholder that always throws (unchanged since Prompt 2) — never called from this card, never shown as a fake count |
| Security Status | **Real** | `useDevice()` + `useBiometric()` + `deriveProtectionSummary()` — the exact Prompt 6 Security Center Home logic, sharing its TanStack Query cache |
| Quick Actions | **Real navigation** | `dashboardQuickActions.ts`'s config array points only at already-registered routes; no business logic triggered |
| Recent Activity | Unavailable | `audit_logs` has zero RLS grants for the `authenticated` role (Prompt 6's decisive finding, `packages/db/src/schema/audit.ts`) — no backend source this app can read |
| Future Insights | UI-only | Labels + "Coming soon" only; no calculation, no fabricated chart/statistic |

**New pure-logic modules** (`src/features/dashboard/`, no `react-native`/`expo-router` runtime import, Vitest-tested): `dashboardContent.ts` (date formatting, all static/unavailable copy), `dashboardQuickActions.ts` (the Quick Actions config array — `Href` is a type-only import, erased at compile time, same pattern as `src/navigation/routeGuard.ts`).

**Loading/empty/unavailable/error distinction.** Only the Security Status section has an actual asynchronous data source (the device/biometric queries); it alone shows a `Skeleton` while loading and `ErrorState` on failure. Every other section's state (unavailable) is known synchronously — there is no async source to wait on — so none of them shows an artificial loading spinner before an already-known outcome; doing so would be a manufactured delay, not a polished loading state. "Unavailable" (`EmptyState` with "…isn't available yet" copy) is used throughout instead of "No data," to avoid implying a query ran and found nothing when no query exists at all.

**Reusable components added:** `src/components/ui/SectionHeader.tsx` (generic title/subtitle label, used by every dashboard section — six real call sites); `src/features/dashboard/components/QuickActionCard.tsx` (single quick-action tile, reused by `QuickActionsSection` for every configured action). No `DashboardCard`/`StatCard`/`MetricTile`-as-a-separate-component-family was built beyond what the sections above actually needed — existing `Card`/`EmptyState`/`ErrorState`/`Skeleton` primitives cover the remaining cases without a new abstraction.

**Testing.** `dashboardContent.test.ts` and `dashboardQuickActions.test.ts` follow this app's existing pure-logic-only Vitest convention (§11) — no component/screen rendering test exists for the new dashboard components, for the same reason none exists for any other screen in this app: `jest-expo`/`@testing-library/react-native` remains a deliberately not-yet-made decision (§11), unchanged by this prompt.

## 14. Notification System (Prompt 8)

See `docs/notifications.md` for the full architecture, capability matrix, and testing/native-verification limitations — this section only cross-references it from the conventions this file otherwise documents.

`expo-notifications` (`~0.32.17`) was added in this prompt — the only new dependency (`npx expo install expo-notifications`, SDK 54-compatible resolution) — real permission/token-capability detection and notification-response (tap) handling, with no backend push-token-registration endpoint to complete the loop yet (see `docs/notifications.md`'s capability matrix, item 4).

## 15. Leave Approval UI & User Experience (Prompt 9A)

See `docs/leave-approval.md` for the full architecture, capability matrix, presentation-state model, and Prompt 9B integration points — this is presentation-only; no backend mutation, biometric invocation, or realtime synchronization was implemented. No new dependency was added. `SecurityBanner` moved from `features/devices/components/` to `components/ui/` in this prompt (§6 above) once a second feature needed it.

## 16. Profile, Settings & Account Management (Prompt 11)

See `docs/profile.md` for the full architecture, capability matrix, and native-verification limitations. Summary: `parents_select_own`/`parents_update_own` and `students_select_linked_parent` RLS grants (previously identified but deliberately left unwired in Prompts 7/9A/10, since those prompts were explicitly presentation-only or out of scope) are used here for real — Profile Home and Linked Student Details are backed by genuine Supabase reads, and profile name editing is this app's first real (non-fail-closed) write. `DetailRow` and `ConfirmationPanel` moved from `features/leave-approval/components/` to `components/ui/` (§6) once Profile/Settings needed the identical renderers. No new dependency was added. Settings → Security and → Notifications are entry points into the existing Security Center (Prompt 6) and Notification Settings (Prompt 8) — neither was duplicated. Logout reuses the existing `useAuth().signOut()` (Prompt 3) — no second authentication mechanism.

## 17. Testing, Optimization & Release Hardening — RC1 (Prompt 12)

See `docs/rc1-hardening.md` for the full issue inventory, fixes, and RC1 readiness assessment. No new product feature was added — this was a defect-discovery and hardening pass over Prompts 1–11. Summary of what changed: a BLOCKER data-correctness bug (unfiltered "pending" leave count), a HIGH backend security gap (biometric step-up assertions were not bound to the specific leave request they were captured for — now enforced server-side in `LeaveService.decide()`), realtime-reconnect and TanStack Query `onlineManager`/NetInfo wiring gaps, a `NetworkContext` derivation bug contradicting its own documented invariant (extracted to a new, directly-testable `contexts/networkStatus.ts`), CORS/test-route production hardening in `apps/api`, a duplicated device-trust-state predicate consolidated onto the existing `getDeviceTrustState()` helper, dead-code removal (`utils/async.ts`), and two accessibility fixes (confirmation-dialog screen-reader announcements, `ErrorBoundary` fallback contrast). One new production blocker was discovered and documented, not fixed (unauthenticated SMS-OTP triggering with no pre-check — building the real fix is new backend scope, out of this pass's bounds).
