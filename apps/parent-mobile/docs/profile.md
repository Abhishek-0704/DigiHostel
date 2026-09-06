# Parent Mobile Application — Profile, Settings & Account Management (Prompt 11)

This document covers Prompt 11: Profile Home, Edit Profile, Linked Student Details, and the full Settings hierarchy (Account, Notifications, Security, Privacy, Help & Support, About, Legal). It follows the established pattern of `docs/notifications.md`/`docs/leave-approval.md` — a capability matrix first, then architecture, then explicit limitations.

## 1. Capability Matrix

Established by direct inspection (`packages/db/src/schema/identity.ts`, `hostel.ts`, `apps/api/src/routes/`, `packages/api-spec/openapi.yaml`) before any UI code was written.

| Capability | Backend/API | DB/RLS | Decision |
|---|---|---|---|
| Parent profile retrieval (name, phone) | No `/profile` route exists | `parents_select_own` — **real** | **IMPLEMENTED** — direct Supabase read, mirroring `deviceService`/`notificationService`'s established pattern |
| Profile editing — name | No route | `parents_update_own` — **real** | **IMPLEMENTED** — the first genuine Supabase table WRITE in this app's history (see §2 for why this one is safe where device/biometric writes are not) |
| Profile editing — phone number | No route | `parents_update_own` technically permits it | **DEFERRED (intentionally read-only)** — `parents.phone_number` is the field ADR-020's OTP-recipient lookup matches against; editing it has an authentication-identity implication beyond ordinary profile data |
| Registered mobile | — | `parents.phone_number` | **IMPLEMENTED** |
| Registered email | — | Supabase Auth session `user.email` | **IMPLEMENTED**, but expected `null` for every account — this app's only sign-in method is phone OTP (ADR-020) |
| Account creation date | — | Supabase Auth session `user.created_at` | **IMPLEMENTED** — already available via the existing `useSession()`, no new fetch |
| Last login | — | Supabase Auth session `user.last_sign_in_at` | **IMPLEMENTED** |
| Linked students (name, roll no.) | No route | `students_select_linked_parent` — **real** | **IMPLEMENTED** — closes a gap explicitly deferred in Prompts 7/9A/10 |
| Student hostel/room | No route | `hostels`/`rooms` openly readable (`_select_authenticated`) | **IMPLEMENTED** — resolved by id, name shown, id never exposed |
| Student department/programme/year | — | **No such columns exist** on `students` (only `roll_number`, `full_name`, `hostel_id`, `room_id`) | **NOT APPLICABLE** |
| Parent relationship to student | — | `parent_student_relationships.relationship_type`, `psr_select_own_parent` — **real** | **IMPLEMENTED** |
| Current leave status / recent activity per student | `GET /leave-requests` (real, Prompt 9B) | via `approvalService.listForCurrentParent()` | **IMPLEMENTED** — reuses `usePendingApprovals()`'s already-fetched data, filtered by `studentId` (a new opaque field added to `LeaveRequestPresentation` in this prompt — see §6) |
| Verified status | — | via `useDevice()`'s real trusted-device state | **IMPLEMENTED (reused)** — "verified" means "has an active trusted device," not a new identity-verification concept |
| Notification category preferences | No backend persistence (`docs/notifications.md` §1) | — | **NOT AVAILABLE** — unchanged, reuses the existing Prompt 8 screen |
| Notification platform permission | `expo-notifications`, real (Prompt 8) | — | **IMPLEMENTED (reused)** |
| Sound/Vibration/Preview/Quiet Hours | No portable cross-platform API this app uses | — | **NOT AVAILABLE** — future-ready "Coming soon" rows added to the existing Notification Settings screen |
| Security state (biometric, trusted device) | real | real | **IMPLEMENTED (reused)** — Settings → Security is an entry point, not a duplicate |
| Session information | `useSession()`, real | — | **IMPLEMENTED (partial)** — Supabase's client SDK exposes only the current session, not a list of other active sessions/devices at the auth layer |
| Privacy information | Derived from `docs/security.md`/ADR-014, non-technical | — | **IMPLEMENTED** as static educational content |
| Support information | No ticketing backend | — | **IMPLEMENTED** as static FAQ/contact content; ticket submission explicitly **NOT AVAILABLE** |
| Legal content | No approved document exists in this repository | — | **NOT AVAILABLE** — clearly labeled placeholder text |
| Logout | `authService.signOut()`, real (Prompt 3) | — | **IMPLEMENTED (reused)** |
| Session expiration | `authStatus.ts`/`AuthGate`, real (Prompt 3) | — | **IMPLEMENTED (reused)** — no new mechanism |

## 2. Why Profile Editing Is a Real Write (Unlike Device/Biometric)

Every prior "write" in this app's history (`deviceService.registerCurrentDevice()`/`revokeDevice()`) is deliberately fail-closed, because those actions represent backend-owned **security decisions** (device trust requires ADR-003 attestation this backend doesn't implement yet). Updating your own display name has no such implication — there is no attestation requirement, no audit-trail requirement, no ADR governing it. `parents_update_own`'s RLS grant is a genuine, self-scoped, low-stakes capability, so a direct client write is the correct, minimal architecture here — not a security shortcut. `phoneNumber` is kept read-only specifically because it — unlike the name — DOES have a security/identity-adjacent implication (§1).

## 3. Screen Hierarchy

```
(tabs)/profile                    Profile Home — real data
profile/edit                      Edit Profile — name only editable
profile/students/[id]             Linked Student Details — read-only

settings/index                    Settings Home — 7 sections
settings/account                  Account — session info + Logout
settings/security                 Security — entry point into the existing Security Center
settings/privacy                  Privacy — static educational content
settings/legal                    Legal — document list
settings/legal/[doc]              Legal document detail — placeholder content

notifications/settings            EXTENDED (Prompt 8 screen) — Sound/Vibration/Preview/Quiet Hours rows added
help/index                        REWRITTEN — real FAQ/contact content
about/index                       REWRITTEN — real app.json-sourced version/build info
```

"Notifications" in Settings Home navigates to the **existing** `/(app)/notifications/settings` screen — no duplicate was created.

## 4. Component Inventory

New: `ProfileHeader`, `ProfileInformationCard`, `LinkedStudentCard` (`features/profile/components/`); `NavigationRow`, `SettingsSectionGroup` (`features/settings/components/`).

**Relocated to `components/ui/` in this prompt** (same precedent as `SecurityInformationCard`/`SecurityBanner` before it — promoted once a second feature needed the identical renderer):
- `DetailRow` (was `features/leave-approval/components/`) — now used by Profile, Account, Linked Student Details, Security Settings, and unchanged by leave-approval/history.
- `ConfirmationPanel` (was `features/leave-approval/components/`) — now used by Account's Logout confirmation and unchanged by Leave Details' Approve/Reject confirmation.

Reused, not duplicated: `Card`, `Badge`, `Button`, `TextField`, `Divider`, `EmptyState`, `ErrorState`, `Skeleton`, `Loader`, `PageContainer`, `PageHeader`, `SectionHeader`, `SecurityBanner`.

## 5. Service Architecture

`profileService` (`src/services/profile/profile.ts`) — the one new service boundary this prompt introduces, justified: Profile/linked-student data is a genuinely new data domain no existing service covers. Three real operations (`getParentProfile`, `updateParentProfile`, `listLinkedStudents`), all direct Supabase reads/one write — no fabricated persistence, no new abstraction beyond what's needed.

No `PreferencesService`/`SupportService`/`LegalContentService`/`AccountService` were created — notification preferences remain the existing Prompt 8 screen's responsibility; support/legal/about content is static, pure data (`supportContent.ts`/`legalContent.ts`) needing no service; account actions reuse the existing `useAuth()`.

## 6. State Management

`useProfile()` and `useLinkedStudents()` (`features/profile/hooks/`) — TanStack Query, namespaced `["parent-mobile", "profile", ...]`, mirroring every other feature's convention. `useLinkedStudents()` reuses `usePendingApprovals()` directly (Prompt 9B) rather than a second leave-data query.

**One minimal, additive extension to existing code:** `LeaveRequestPresentation` (`features/leave-approval/types.ts`) gained a `studentId: string | null` field — an opaque correlation key, never rendered as visible text — so Profile's per-student leave summary could be derived from the existing leave data without a new data source. `mapLeaveRequestToPresentation()` and `mapLeaveRequestToHistoryRecord()` (approval-history) were updated accordingly; this is additive and non-breaking (`student`, the rich presentation object, is unaffected and still `null`).

No new global store; local `useState` for edit-form/confirmation/UI state throughout, per this prompt's own state-management constraints.

## 7. Navigation Integration

Profile Home gains Quick Links to the existing Security Center, Approval History tab, and Help & Support. Settings Home's Security section is an entry point only — every actual action (manage trusted devices, biometric settings, security tips) navigates into the **existing, unmodified** `/(app)/security/*` routes. The four-tab bottom navigation is unchanged.

## 8. Accessibility Checklist

Roles/labels on every row and control, `accessibilityLiveRegion` on the Edit Profile save confirmation, 44pt touch targets (`NavigationRow`, cards), dynamic-text-safe layout, dark mode via theme tokens throughout, no color-only status communication (every badge pairs a tone with explanatory text). Native screen-reader verification **not performed** — no device/emulator available (unchanged environment limitation).

## 9. Testing Results

New test files: `profile.test.ts` (service, mocked Supabase client — 7 tests), `profilePresentationMapper.test.ts` (6 tests), `profileErrors.test.ts` (3 tests), `settingsSections.test.ts` (9 tests), `settingsContent.test.ts` (7 tests). Full suite: **573 passed, 28 skipped**, zero regressions (existing leave-approval/approval-history fixture helpers were updated for the additive `studentId` field, not weakened).

## 10. Native/Device Verification

**Not performed** — no Android emulator/device, no local Supabase/Docker stack (unchanged limitation from every prior prompt). Consequently, `profileService.listLinkedStudents()`'s multi-table join was written against the real schema/RLS but has **not been exercised against a live database** in this environment — it deliberately uses only query shapes already proven working elsewhere in this app (plain `.select()/.in()`, no untested nested embed) to minimize that risk, but this is disclosed honestly rather than claimed as verified.

Automated verification performed instead: full workspace typecheck, lint, format, the complete test suite, `expo export --platform android` (clean), `expo-doctor` (18/18).

## 11. Deferred / Unavailable Capabilities

Phone-number editing, per-category notification preferences, Sound/Vibration/Preview/Quiet Hours, in-app support ticketing, final legal documents, a list of other active sessions/devices at the Supabase Auth layer, student department/programme/year (no such data exists).

## 12. Future Extensibility

- Phone-number editing could be added once a deliberate decision is made about its OTP-identity implication (e.g. requiring re-verification).
- Notification category/Sound/Vibration preferences slot into the same "Coming soon" rows the moment a real per-category or per-channel mechanism exists.
- Legal placeholders are content-only (`LegalDocument.body`) — replacing them with approved text requires no structural change.
- `profileService.listLinkedStudents()`'s multi-query join could be optimized into a single PostgREST nested-embed query once verified against a live instance.
