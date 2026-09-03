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
    (tabs)/                    Dashboard, Notifications, Profile
    leave/[id]                 Approval Details
    history/, security/, settings/, help/, about/

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
  services/                    Service abstractions (Supabase, storage, logger, device identity, biometric/device/notification/approval placeholders)
  styles/                      Design tokens + typography scale
  types/                       App-local shared types (error taxonomy)
  utils/                       Pure, framework-agnostic helpers
```

**Consolidation from the originally proposed skeleton:** `components/common/` and `components/navigation/` were folded into `components/layout/` — neither had genuinely distinct content once the actual foundation pieces were built (see `src/components/index.ts`'s doc comment). Split them back out if a future feature needs content that doesn't fit `layout/`. **This is unrelated to** the top-level `src/navigation/` directory added in Prompt 3 — that one holds route-*protection logic* (no UI components at all), not navigation-chrome components, so it doesn't reopen the consolidation decision above.

`features/*` directories are intentionally not created in this pass — no feature has real code yet, and empty directories created merely to match a proposed skeleton were avoided per this prompt's own instruction.

## 3. Routing Conventions

Expo Router, file-system based, `typedRoutes` experiment enabled (`app.json`) for compile-time route-name/param checking. Route groups follow auth state boundaries: `(auth)` → `(onboarding)` → `(app)`. **Route protection is now real (Prompt 3)** — see `docs/authentication.md` §6 for `AuthGate`'s redirect logic; this is a UX/navigation mechanism only, never the actual security boundary.

Every screen created in this pass is a structural placeholder (`PlaceholderScreen` component) — none contain business logic, matching this prompt's explicit scope boundary.

## 4. Configuration / Environment Conventions

Only `EXPO_PUBLIC_`-prefixed variables are used (Expo's own convention for client-bundle-safe values — see `env.example`). `src/config/env.ts`'s `getEnv()` validates lazily, at first point of use, not at app startup, so the app remains bootable without a configured `.env`.

**Naming-mismatch resolution (Prompt 1's flagged risk):** `@digihostel/api-client-react`'s fetch mutator was changed from reading an unprefixed `API_BASE_URL` to `EXPO_PUBLIC_API_BASE_URL` — the unprefixed form would never actually reach the compiled app bundle. This is the one convention; do not introduce a second one.

Never add a non-`EXPO_PUBLIC_` variable to this app's `env.example` or `.env` — those are backend-only and belong solely to the repo root's `env.example`.

## 5. Theme / Design-Token System

`src/styles/tokens.ts` — semantic color roles (not literals), spacing/radii/icon-size/motion/elevation scales, light and dark palettes. `src/styles/typography.ts` — a nine-step type scale using the platform system font (no custom font bundled). `ThemeContext` resolves `system | light | dark` preference (persisted via `expo-secure-store`, chosen to avoid a second storage dependency) against `react-native`'s `useColorScheme`. Every shared component reads colors/spacing from `useTheme()`, never a hardcoded literal.

## 6. Shared Component Conventions

`src/components/ui` (Button, Card, TextField, Badge, Divider), `src/components/feedback` (Loader, Skeleton, EmptyState, ErrorState, ErrorBoundary), `src/components/layout` (PageContainer, PageHeader, ScrollContainer, OfflineBanner, PlaceholderScreen). All are strongly typed, own no business logic, and read every visual value from the design tokens. Dialog, BottomSheet, Avatar, Chip, Snackbar, SearchBar, and a dedicated IconButton/NavigationBar were deliberately not built — no current screen needs them; add them when a real consumer exists.

## 7. Service-Layer Conventions

Every service is an interface + one implementation, mirroring the backend's own honest-placeholder discipline (`apps/api/src/lib/auth/security-gates.ts`'s `NotImplementedAttestationGate` pattern):

| Service | Status | Note |
|---|---|---|
| `services/supabase` | Real — session lifecycle **and phone-OTP send/verify** (Prompt 3) | See `docs/authentication.md`; no roll-number pre-check (backend gap) |
| `services/storage` (secure storage) | Real | `expo-secure-store` wrapper |
| `services/logger` | Real | Thin `console` wrapper, swappable later |
| `services/deviceIdentity` | Real (Prompt 3) | App-generated UUID via `expo-crypto`, never a hardware identifier |
| `services/biometric` | Placeholder, throws | No `expo-local-authentication` installed yet — Prompt 5 |
| `services/devices` | **Partial (Prompt 3)** — status lookup real (RLS-verified); registration/revocation still throw | See `docs/authentication.md` §5 for exactly why each half is or isn't implemented |
| `services/notifications` | Placeholder, throws | Blocked on a backend endpoint that doesn't exist |
| `services/approvals` | Placeholder, throws | Backend contract IS ready; wiring deferred to the leave-approval feature prompt by this prompt's own scope boundary |
| `services/api` | Real (re-export) + **auth-token wiring (Prompt 3)** | Thin indirection over `@digihostel/api-client-react`; `authTokenProvider.ts` attaches the Supabase session to every generated-client request |

Never treat a placeholder's eventual real implementation as sufficient proof for a security decision by itself — the server remains authoritative regardless of what the client believes.

## 8. State-Management Conventions

Server state: TanStack Query only, via the generated hooks re-exported from `services/api`. Client-only state: local component state. Cross-cutting concerns get a Context (`ThemeContext`, `NetworkContext`, `SessionContext`, `NotificationContext`) — nothing else. No global state library beyond TanStack Query + Context; none is justified by the accepted architecture.

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
