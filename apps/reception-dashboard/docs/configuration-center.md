# Enterprise Configuration Center (Phase 5, Prompt 14)

Adds a new, dedicated administration workspace at `/configuration` for
viewing, creating, and editing platform/hostel/operational configuration.
Not a replacement for an existing placeholder — see §0.

## 0. Routing decision

`SettingsPage.tsx`/`SystemPage.tsx` (the two existing placeholder routes an
implementer might assume this prompt targets) are each reserved for a
different, distinct concept: `SettingsPage` is explicitly documented as
"personal-account... not administrative" (ungated by permission, in
`routes/index.tsx`'s own comment) and self-labels "Phase 7, Prompt 17";
`SystemPage` is gated by `system:view` (super_admin only) and self-labels
"Phase 7, Prompt 18" for future system-health *monitoring*, a different
concern than administrative configuration *editing*. Overloading either
would have silently repurposed a route this project's own convention
already scopes to something else, and `configuration:manage` (the
permission this prompt actually needs — granted to `hostel_admin` **and**
`super_admin`, distinct from `system:view`'s super_admin-only grant) was
never wired to either route. This prompt therefore adds a new route,
`/configuration`, with its own nav item ("Configuration," Administration
group) — the smallest change consistent with the existing permission
model, not a scope reduction.

(Note: `SettingsPage.tsx`/`SystemPage.tsx` self-label "Phase 7, Prompt
17/18" while this task was given as "Phase 5, Prompt 14" — a real, factual
discrepancy in this codebase's own phase/prompt labeling, recorded here
rather than silently reconciled, matching this project's established
precedent (Prompts 1/2/3 each found and recorded similar discrepancies
without letting them block the requested work).)

## 1. Reconnaissance summary

Performed before any code was written:

- No configuration/settings/feature-flag/reference-data table existed
  anywhere in the schema (full grep of `packages/db/src/schema/*.ts` and
  `supabase/migrations/*.sql` for "config|setting|feature_flag|parameter").
- `hostels`/`rooms` (`packages/db/src/schema/hostel.ts`) are extremely
  minimal — `hostels`: `id, name, createdAt` (3 columns); `rooms`: `id,
  hostelId, roomNumber, createdAt` (4 columns). No block/floor/capacity/
  reception-desk/warden-assignment/emergency-contact/status column exists.
- `configuration:manage` (granted to `hostel_admin`+`super_admin`) and
  `system:view` (super_admin only) already exist in
  `lib/authorization/permissions.ts`/`policy.ts` but neither was wired to
  any route before this task.
- `apps/api/src/config/{escalation,rateLimit,deviceAttestation}.ts` already
  implement a devops-level "configurable via env var, read once at process
  startup" pattern with named exports — these are genuinely different from
  a staff-editable, DB-backed, per-request-read configuration model. See
  §5 for how this task treats the distinction honestly.
- No academic data (department/program/semester/academic-year) exists on
  `students` — confirmed directly. No notification-template concept exists
  anywhere (`notifications` is a delivery-tracking record with no
  title/body/subject column).

## 2. Capability classification

| Requested capability | Status | Notes |
|---|---|---|
| Configuration storage (domain/key/value/scope/type/description/active/version/audit) | IMPLEMENTED | One generic `configuration_entries` table |
| Configuration dashboard (categories, statistics, recent state) | IMPLEMENTED | Real server-derived statistics, no fabricated "system health" widget |
| Configuration editor (view/edit/validate/preview/save/discard) | IMPLEMENTED | Current Value / Proposed Value distinction, real stateless `/validate` preview |
| Server-side validation (key format, domain allow-list, value/type consistency, scope/hostel consistency, hostel existence) | IMPLEMENTED | `domain/configuration/validation.ts`, shared by both the real write path and the preview endpoint |
| Hostel-scoped authorization (never trusting client-supplied scope) | IMPLEMENTED | Server-resolved `role`/`hostelId` from `request.auth.profile` only |
| Optimistic concurrency (prevent silent stale overwrite) | IMPLEMENTED | `version` column + `expectedVersion` on every `PATCH`, `409 stale_version` on mismatch |
| Audit integration (existing Enterprise Audit Center) | IMPLEMENTED | Every create/update writes one `audit_logs` row; live-verified visible in `/audit` |
| Feature-flag data model | IMPLEMENTED (storage only) | `domain: "feature_flags"` rows in the same generic table — explicitly labeled NOT EXECUTED AT RUNTIME (§6) |
| Hostel structural config (blocks, floors, capacity, reception desks, warden assignments) | ARCHITECTURAL PREPARATION | No existing table represents these; a hostel-level *setting* (e.g. an emergency-contact note) is supported via a `scope:"hostel"` configuration entry referencing the existing `hostels.id` — the structural entities themselves were not built (would be a genuinely new domain model, not configuration) |
| Academic configuration (departments, programs, eligibility) | DEFERRED | No existing consumer of academic data anywhere in the certified application — no table added, per the prompt's own "implement only the minimum justified by the current application" instruction |
| Runtime consumption by existing engines (escalation timing, notification retry, emergency SLAs, etc.) | CONFIGURATION STORED — RUNTIME CONSUMPTION DEFERRED | See §5 |
| Configuration rollback / full version history / approval workflow | STRICTLY OUT OF SCOPE (per the prompt's own explicit exclusion list) | Not built. `audit_logs`' before/after metadata is the extension point for a future version-comparison UI |
| Deletion | DEFERRED (deactivation used instead) | `isActive` toggle only — no hard-delete endpoint, since no referential-integrity story was worked out for genuine deletion and none was required |

## 3. Data model

One table, `configuration_entries` (migration `0022`): `id, domain, key,
value (jsonb), valueType, description, scope, hostelId, isActive, version,
createdBy, updatedBy, createdAt, updatedAt`. Two partial unique indexes
enforce domain+key uniqueness correctly for both global (hostel_id IS
NULL) and hostel scopes (a plain unique constraint would not catch
duplicate globals, since Postgres treats every NULL as distinct). A CHECK
constraint enforces scope/hostel_id consistency at the database layer, not
only in application code.

**Why one table, not four**: the prompt's own "CONFIGURATION DATA MODEL"
section lists `configuration_domains`/`configuration_entries`/
`configuration_metadata`/`configuration_validation_rules` as a *possible*
shape, explicitly warning "do not automatically create every table listed
above." A single row here already carries every field the prompt's own
"Configuration data should support" list names; `domain` is a
server-validated `text` column (an application-layer allow-list,
`CONFIGURATION_DOMAINS`), mirroring `audit_logs.entity_type`'s identical
precedent, rather than a second table whose only content would be a small,
effectively-static list of names.

## 4. Hostel configuration strategy

No new hostel table, no new scope model. Hostel-scoped configuration
reuses the EXISTING `hostels.id` directly (`configuration_entries.hostelId
→ hostels.id`, a real foreign key). `hostel_admin` may create/edit only
`scope:"hostel"` entries naming their own resolved hostel id (server-side,
never client-supplied); `super_admin` is unscoped. Structural hostel
expansion (blocks, floors, room capacity, reception desks, warden
assignments, emergency contacts as first-class hostel *fields*) remains
architectural preparation — see §2's classification table for why building
these now would have been an uncontrolled cross-module schema change.

## 5. Runtime-consumption boundary (read this before assuming a value is "live")

`apps/api/src/config/{escalation,rateLimit,deviceAttestation}.ts` are
already env-var-driven, read once at process startup by the escalation
worker / rate limiter / device-attestation verifier — genuinely different
machinery from a per-request DB read. Wiring any of them to read from
`configuration_entries` at runtime would mean modifying the business logic
of already-certified modules (the escalation worker, the notification
worker) — explicitly forbidden by this prompt's own "do NOT rewrite
existing domain engines" instruction unless narrowly achievable. It is
not. **No existing engine reads `configuration_entries` at runtime.**
Every value stored through this Center is genuinely persisted, validated,
audited, and editable — but is **CONFIGURATION STORED — RUNTIME
CONSUMPTION DEFERRED**, not live-consumed, until a future, narrowly-scoped
task explicitly wires a specific engine to read a specific key. This
document, and the UI itself, never claims otherwise.

## 6. Feature flags

`domain: "feature_flags"` rows (boolean `valueType`) are supported as
ordinary configuration entries — storage and administration only. **No
feature-gating code path exists anywhere in this application**; nothing
reads a `feature_flags` entry to conditionally render a component or gate
a route. This is architectural preparation, per the prompt's own explicit
"NOT EXECUTED AT RUNTIME" requirement — not a working feature-flag system.

## 7. Security

- Every route: `[authenticate, requireStaffRole("hostel_admin",
  "super_admin"), requireAal2()]` — reuses the existing `configuration:manage`
  permission's exact role grant, the existing AAL2 boundary, no new
  authentication mechanism.
- `configuration_entries` has **zero client-facing RLS policies**
  (mirrors `audit_logs` exactly) — Fastify's service-role connection is
  the only reader/writer; every authorization decision is made once, in
  `apps/api/src/domain/configuration/`.
- Hostel-scope authorization never trusts a client-supplied hostel id —
  always the caller's own server-resolved `staff.hostel_id`
  (`request.auth.profile`).
- Optimistic concurrency: a `PATCH` without the current `version` is
  rejected with `409 stale_version` rather than silently overwriting a
  concurrent change.
- Secret rejection: a key/domain resembling password/token/API
  key/credential is rejected at validation time — no secret can ever be
  stored as an ordinary configuration value.
- Suspended/inactive staff: reuses the existing `findStaffByAuthUserId`
  enforcement (filters `status = 'active'`) — no new code path, live-proven
  in Prompt 13 and re-exercised (not re-proven) by this domain's own route
  tests.

## 8. Audit integration

Every create/update writes one `audit_logs` row
(`actorType:"staff", action:"configuration.created"/"configuration.updated"/
"configuration.activated"/"configuration.deactivated",
entityType:"configuration_entries", entityId, metadata:{domain, key,
scope, hostelId, before, after}`) — reusing the exact table and pattern
Prompts 12/13 already established. Creation uses fire-and-forget audit
writes (matches `staff.create()`'s established convention: the primary
action has already durably succeeded); updates write the audit row inside
the same transaction as the state change (stronger — the row change and
its audit record either both happen or neither does). **Live-verified**
(§10): `configuration.created`/`configuration.updated`/
`configuration.deactivated` all appeared correctly in the real Audit
Center UI at `/audit`, classified under the `other` module (this domain
is not one of the Audit Center's existing enumerated modules
leave/movement/emergency/health/device/staff-auth — an honest
classification, not a miscategorization; extending that enum is out of
this task's scope).

## 9. Frontend

`services/configuration/ConfigurationService.ts`,
`features/configuration/*` hooks, `components/configuration/*`
(`ConfigurationTable`, `ConfigurationFilterBar`, `ConfigurationDetailPanel`,
`ConfigurationStatisticsStrip`, `CreateConfigurationDialog`,
`ConfigurationValueInput` — a type-aware value editor rendering the
correct native control per `valueType`), `pages/ConfigurationPage.tsx` —
all mirror `UsersPage`'s/Prompt-13's established split-pane,
server-side-pagination pattern. The detail panel's edit mode shows
**Current Value** and **Proposed Value** simultaneously (never silently
replacing one with the other), per this prompt's own explicit "Configuration
Editor" requirement.

## 10. Live verification (real local Supabase + a real running `apps/api`, real browser)

Performed as `superadmin1@example.test` (real password + genuinely
enrolled/verified TOTP, real AAL2):

- Configuration Center dashboard renders real, honest empty statistics
  (0/0/0 — no fabricated data) on first load.
- Created a real entry (`system.maintenance_banner_text`, string, global)
  through the full **Validate → Create** workflow — `POST
  /configuration/validate` returned a real "✓ Valid" server verdict before
  submission; `POST /configuration` returned a real `201`, a success toast,
  and Total Entries went 0 → 1.
- Opened the entry — real Identity/Current Value/Audit sections, correct
  creator name and timestamp.
- **Edit**: entered edit mode, saw Current Value and Proposed Value
  simultaneously, changed the value, Saved — real `200`, version 1 → 2,
  Current Value updated, a real success toast.
- **Deactivate**: confirmation dialog rendered correctly (dark-theme
  styling, matching the Prompt 13 `Dialog.module.css` fix), confirmed —
  real `200`, version 2 → 3, statistics flipped (Active 1→0, Inactive
  0→1), status badge changed to "Inactive," button relabeled "Activate."
- **Audit Center cross-check**: navigated to the real, already-certified
  `/audit` page and confirmed `configuration.created`,
  `configuration.updated`, and `configuration.deactivated` all appear with
  the correct actor ("Test Super Admin, Staff · super_admin") and matching
  timestamps — proving the audit integration is genuinely wired through
  the existing Enterprise Audit Center, not a separate/fabricated log.
- Test data cleaned up via a full `supabase db reset` afterward (this
  domain has no seed-data dependency, so a full reset is the simplest
  correct cleanup — unlike the staff domain, no `auth.users` row needed
  individual deletion).

**Not performed**: a live cross-hostel adversarial walkthrough as a real
`hostel_admin` session (covered instead by 28 backend route tests + 7 real-
Postgres integration tests, including genuine cross-hostel denial and a
genuine concurrent-update race — the identical evidence tier this
project's own established convention accepts when a full second live
staff identity's TOTP enrollment would be the only source of additional
coverage beyond what those tests already prove).
**Live assistive-technology audit**: NOT PERFORMED. CODE-LEVEL
ACCESSIBILITY ONLY — every control reuses this application's own
already-audited primitives (`FormField`, `Button`, `Dialog`,
`ConfirmationDialog`, `Table`), so no new accessibility pattern was
introduced, but no screen-reader/keyboard walkthrough specific to this
page was performed.

## 11. Deliberately not built (and why)

- Configuration rollback/restore, full version history UI, an approval
  workflow for configuration changes — explicitly out of scope per the
  prompt's own exclusion list. `audit_logs`' before/after metadata is the
  real extension point for a future version-comparison feature.
- Feature-flag *execution* — no code path anywhere reads a `feature_flags`
  entry to gate behavior (§6).
- Runtime consumption by the escalation/notification/rate-limit/device-
  attestation engines — would require modifying already-certified business
  logic (§5).
- Hostel structural expansion (blocks, floors, capacity, reception desks,
  warden assignments as first-class fields) — no existing table, and
  building one would be a new domain model, not configuration (§2/§4).
- Academic/library/visitor/reporting configuration domains — no existing
  consumer for any of them in the certified application.
- A second, distinct-classification module in the Audit Center's own
  `AuditModule` enum for configuration events — reuses the existing
  `other` classification instead of extending a certified, already-tested
  enum for this task alone.
