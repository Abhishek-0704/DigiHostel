# Database Schema Design

Complete relational model for DigiHostel, per ADR-002, ADR-014, ADR-015, and `docs/auth-database-security-model.md`. Design only in this document — actual Drizzle schema/migrations are under `packages/db/src/schema/` and `supabase/migrations/`, generated from this design, not the reverse.

Canonical rule throughout (ADR-002/ADR-015/`docs/auth-database-security-model.md`): **relationship data is never duplicated into JWT claims.** Every relationship below is a PostgreSQL foreign key or join table, enforced by RLS (`docs/rls-policy-matrix.md`), queried live.

All tables live in the `public` schema unless noted. All tables have `created_at timestamptz not null default now()`; mutable tables additionally have `updated_at timestamptz not null default now()` (omitted from the per-table notes below unless there's something non-default to say). All primary keys are `uuid default gen_random_uuid()` unless noted.

---

## Identity/Profile Domain

### `students`
One row per student. Links to Supabase Auth per `docs/auth-database-security-model.md` §2–§3.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `auth_user_id` | uuid, FK → `auth.users.id` | **nullable** until the student completes registration; **unique** (1:1) |
| `roll_number` | text | **unique, not null** — SDD Ch.2/Ch.4's primary lookup key |
| `full_name` | text | not null |
| `hostel_id` | uuid, FK → `hostels.id` | nullable (assigned post-admission) |
| `room_id` | uuid, FK → `rooms.id` | nullable — kept denormalized alongside `student_room_assignments` for fast current-assignment lookups; `student_room_assignments` remains the authoritative history |

- **Cardinality**: 1 `students` ↔ 0..1 `auth.users` ↔ 0..1 current `rooms`.
- **Lifecycle**: created at admission (roll number known before `auth_user_id` exists — a student may be provisioned before first login); `auth_user_id` populated at first successful auth.
- **Indexes**: unique on `roll_number` (lookup path, SDD Ch.4 §4.2); index on `hostel_id`, `room_id` for reception queries.
- **Retention**: retained per institutional record-keeping norms; not DPDP-time-boxed like incident/geolocation data (§ Device/Security domain).
- **Sensitive fields**: none directly (no biometric, no raw contact info beyond what's needed — phone number lives on `auth.users`, not duplicated here).
- **Ownership**: student owns their own row (RLS); Reception/Admin staff have broader read access (`docs/rls-policy-matrix.md`).

### `parents`
One row per parent **or** guardian — a single table for both (ADR-001's context: Guardian is a backup approver in the same escalation chain, not a structurally different entity). The specific relationship type to a given student is captured in `parent_student_relationships`, not here.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `auth_user_id` | uuid, FK → `auth.users.id` | nullable until registration completes; unique |
| `full_name` | text | not null |
| `phone_number` | text | not null — used for the OTP step (SDD Ch.4 §4.2); **sensitive** |

- **Cardinality**: 1 `parents` ↔ 0..1 `auth.users`; 1 `parents` ↔ many `students` via `parent_student_relationships`.
- **Lifecycle**: created when first referenced by a `parent_student_relationships` row (e.g. at student admission, parent contact on file before the parent has ever logged in) or at first self-registration.
- **Indexes**: index on `phone_number` (OTP lookup path); consider partial uniqueness if phone number must be unique per parent — not mandated by the SDD, left as an implementation-time call.
- **Retention**: standard institutional retention.
- **Sensitive fields**: `phone_number` — treated as personal data under DPDP (SDD Ch.17.4).
- **Ownership**: parent owns their own row.

### `staff`
Reception Warden, Library In-charge, Hostel Administrator, Super Administrator (SDD Ch.2 §2.2).

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `auth_user_id` | uuid, FK → `auth.users.id` | not null, unique — staff accounts are provisioned by an admin, always tied to a real login |
| `full_name` | text | not null |
| `role` | enum (`reception_warden`, `library_incharge`, `hostel_admin`, `super_admin`) | not null |
| `hostel_id` | uuid, FK → `hostels.id` | nullable — a Warden's assigned hostel; null for roles not hostel-scoped (Library In-charge, Super Admin) |

- **Cardinality**: 1 `staff` ↔ 1 `auth.users`; 1 `staff` ↔ 0..1 `hostels` (scope).
- **Lifecycle**: admin-provisioned, not self-registered.
- **Indexes**: index on `role` (RBAC queries, SDD Ch.7 §7.5), index on `hostel_id`.
- **Retention**: standard.
- **Sensitive fields**: none beyond standard PII.
- **Ownership**: staff read their own row; only `super_admin` (via Fastify business logic, service-role) manages other staff rows.

### `parent_student_relationships`
The authoritative parent/guardian ↔ student graph (never a JWT claim, per the Critical Rule).

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `parent_id` | uuid, FK → `parents.id` | not null |
| `student_id` | uuid, FK → `students.id` | not null |
| `relationship_type` | enum (`father`, `mother`, `guardian`) | not null — drives the SDD Ch.5 escalation order |
| `escalation_order` | smallint | not null — 1 = first contacted (typically father), 2 = second (mother), 3 = third (guardian), per Ch.5 §5.2's chain |

- **Cardinality**: many-to-many between `parents` and `students`, resolved through this table.
- **Uniqueness**: unique on (`parent_id`, `student_id`) — a given parent/guardian has exactly one relationship record per student.
- **Nullability**: all fields not null.
- **Lifecycle**: created at admission (from institutional records) or during parent onboarding; rarely updated (a relationship_type/order change is an administrative correction, not a routine event).
- **Indexes**: index on `student_id` (escalation-chain lookup, ordered by `escalation_order`), index on `parent_id` (a parent's own dashboard — "which students am I linked to").
- **Retention**: standard.
- **Sensitive fields**: none directly (the relationship *existing* is itself the sensitive fact this table protects via RLS — no PII duplicated here).
- **Ownership**: no single owner — access is governed by whether the caller *is* the parent or the student in the relationship, or staff (`docs/rls-policy-matrix.md`).

---

## Hostel Domain

Kept intentionally minimal — reference/context data only. SDD's MVP scope (`docs/product.md`) is Parent Auth + Leave Approval + Library Pass; room *swapping* is explicit future scope, but a baseline hostel/room reference is needed for reception routing, escalation contact display, and dashboard scoping (SDD Ch.7's Reception Dashboard is hostel-scoped for Wardens).

### `hostels`
| Field | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `name` | text | not null, unique |

- **Lifecycle**: rarely changes, effectively static reference data.
- **Indexes**: unique on `name`.
- **Ownership**: publicly readable by any authenticated user (not sensitive); writes restricted to `super_admin`.

### `rooms`
| Field | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `hostel_id` | uuid, FK → `hostels.id` | not null |
| `room_number` | text | not null |

- **Uniqueness**: unique on (`hostel_id`, `room_number`).
- **Ownership**: publicly readable by authenticated users; writes restricted to `super_admin`/`hostel_admin`.

### `student_room_assignments`
Authoritative history of room assignments (current assignment is also denormalized onto `students.room_id` for query convenience — see that table's note).

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `student_id` | uuid, FK → `students.id` | not null |
| `room_id` | uuid, FK → `rooms.id` | not null |
| `assigned_at` | timestamptz | not null |
| `ended_at` | timestamptz | nullable — null means current assignment |

- **Cardinality**: one student has many historical assignments, at most one with `ended_at is null` (current) — enforced at the application/trigger level, not a plain unique constraint (a partial unique index on (`student_id`) `WHERE ended_at IS NULL` is the correct implementation-time mechanism).
- **Retention**: standard institutional history; not DPDP-sensitive on its own.
- **Ownership**: student reads their own; Reception/Admin read broadly.

---

## Parent Approval Domain

Per ADR-015 — see that ADR for the full rationale behind this exact shape.

### `leave_requests`
| Field | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `student_id` | uuid, FK → `students.id` | not null |
| `reason` | text | not null |
| `start_date` | date | not null |
| `end_date` | date | not null |
| `status` | enum (`pending`, `father_notified`, `mother_notified`, `guardian_notified`, `approved`, `rejected`, `in_app_call`, `manual_verification`, `expired`) | not null, default `pending` — SDD Ch.5 §5.2–§5.3's state machine |
| `updated_at` | timestamptz | not null, auto-updated on every status transition |

- **Cardinality**: 1 `students` ↔ many `leave_requests` (over time); 1 `leave_requests` ↔ many `leave_approval_events`.
- **Lifecycle**: created by student/Reception; mutated only via `status` transitions (each transition also inserts a `leave_approval_events` row — application-enforced pairing, see ADR-015).
- **Indexes**: index on `student_id`, index on `status` (dashboard/escalation-timer queries, ADR-011).
- **Retention**: standard institutional record; referenced by audit requirements indefinitely.
- **Sensitive fields**: `reason` (personal/health-adjacent context) — DPDP-relevant.
- **Ownership**: student owns (read); linked parents/guardians (via `parent_student_relationships`) can read and respond — as implemented, ANY linked parent/guardian may respond, not only "the current escalation-order party" as this line originally anticipated; this is now the **formally accepted design**, [ADR-016](adr/ADR-016-leave-escalation-approval-authority.md) (ACCEPTED, Model C — escalation controls notification priority only). See `docs/rls-policy-matrix.md`'s `leave_requests` row and `docs/leave-escalation-notification-design.md` for the full analysis. Reception/Admin read broadly for manual-verification fallback.

### `leave_approval_events`
**Immutable, append-only.** Per ADR-015.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `leave_request_id` | uuid, FK → `leave_requests.id` | not null |
| `event_type` | enum (`notified`, `responded`, `escalated`, `expired`, `manual_override`) | not null |
| `actor_parent_id` | uuid, FK → `parents.id` | nullable — null for system-generated events (e.g. auto-escalation on timeout) |
| `actor_staff_id` | uuid, FK → `staff.id` | nullable — populated for `manual_override` |
| `response` | enum (`approved`, `rejected`, `no_response`) | nullable — only set on `responded` events |
| `biometric_confirmed` | boolean | not null, default `false` — **must be `true`** for any `responded` event carrying `approved`/`rejected` (SDD Ch.5 §5.2's biometric-gated approval requirement); enforced by a check constraint plus RLS insert policy |
| `occurred_at` | timestamptz | not null |

- **Cardinality**: many events per `leave_requests` row.
- **Nullability**: `actor_parent_id`/`actor_staff_id`/`response` are the only nullable columns, each conditionally required by `event_type`.
- **Lifecycle**: insert-only, forever. No `updated_at` — this table is never updated.
- **Indexes**: index on `leave_request_id` (timeline reconstruction, primary access pattern), index on `occurred_at` for chronological queries.
- **Retention**: retained indefinitely — this *is* the audit trail for the approval workflow (alongside, not replacing, `audit_logs`).
- **Sensitive fields**: none beyond what's implied by the linked `leave_requests` row.
- **Ownership**: same visibility as the parent `leave_requests` row; **no actor may ever `UPDATE`/`DELETE`** — enforced at RLS (`docs/rls-policy-matrix.md`).
- **Verified gap, now resolved by ADR-017 (not by a schema change to this table)**: this table has **no column identifying a notification's recipient** — only `actor_parent_id` (who *performed* an event, e.g. who responded) and `actor_staff_id` exist, and for a system-generated `notified` event both are expected to be `null` per this table's own nullability convention above. A `notified`-type row therefore cannot tell a scheduler *which* parent/contact was notified. This ruled out an earlier proposal to derive the escalation deadline from "the latest `notified` event." **[ADR-017](adr/ADR-017-leave-escalation-orchestration-model.md) §3 (ACCEPTED) instead uses `leave_requests.updated_at`** as the authoritative stage-entry timestamp — no change to this table is needed for that purpose. This table's own recipient-identification gap remains factually accurate and unaddressed (no code writes `notified`/`escalated` events yet, and no schema change is proposed for `leave_approval_events` itself) but no longer blocks anything, since the resolved design doesn't depend on it.

---

## Device/Security Domain

**No raw biometric data is ever stored**, per this task's explicit instruction — biometric verification is captured only as a boolean+timestamp assertion on the relevant event row (`leave_approval_events.biometric_confirmed`, `journey_events.biometric_confirmed` below), never as biometric templates, images, or vendor SDK payloads.

### `trusted_devices`
Device *registration* (long-lived), distinct from Supabase Auth session lifecycle (short-lived, not modeled here — `docs/auth-database-security-model.md` §6, §9).

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `parent_id` | uuid, FK → `parents.id` | not null |
| `platform` | enum (`ios`, `android`) | not null |
| `device_fingerprint` | text | not null — an opaque, non-reversible device identifier (not raw hardware IDs) |
| `registered_at` | timestamptz | not null |
| `revoked_at` | timestamptz | nullable — null means currently trusted |
| `revoked_reason` | text | nullable |

- **Cardinality**: 1 `parents` ↔ many `trusted_devices` (SDD Ch.4 §4.3: multiple devices allowed).
- **Uniqueness**: unique on (`parent_id`, `device_fingerprint`).
- **Lifecycle**: created at successful device-trust registration (after platform attestation, ADR-003/ADR-014); `revoked_at` set on explicit removal — **must trigger active Supabase session revocation** via Fastify's admin-API call (`docs/auth-database-security-model.md` §6/§12), not just this row update.
- **Indexes**: index on `parent_id`; partial index on `revoked_at IS NULL` for "currently trusted devices" queries (used on every sensitive-operation check).
- **Retention**: revoked devices retained (not deleted) for audit purposes.
- **Sensitive fields**: `device_fingerprint` (a device identifier, treated as sensitive).
- **Ownership**: parent owns/reads their own devices; no other role reads this table directly (Fastify's service-role path checks it on their behalf during business authorization).

### `device_attestation_events`
Append-only log of platform-attestation checks (ADR-003/ADR-014), separate from the registration record since attestation should be re-checked at sensitive-operation time, not just once.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `trusted_device_id` | uuid, FK → `trusted_devices.id` | not null |
| `checked_at` | timestamptz | not null |
| `result` | enum (`pass`, `fail`) | not null |
| `provider` | enum (`play_integrity`, `app_attest`, `device_check`) | not null |

- **Cardinality**: many events per `trusted_devices` row.
- **Lifecycle**: insert-only.
- **Indexes**: index on `trusted_device_id`, index on `checked_at`.
- **Retention**: retained for security-audit purposes.
- **Sensitive fields**: none beyond the linked device.
- **Ownership**: same visibility as `trusted_devices`; insert-only via service-role (Fastify), never client-writable.

---

## Library Domain

### `library_passes`
| Field | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `student_id` | uuid, FK → `students.id` | not null |
| `status` | enum (`active`, `closed`) | not null, default `active` |
| `expected_return_by` | timestamptz | nullable — set when the student departs for the library; drives overdue detection |
| `is_overdue` | boolean | not null, default `false` — maintained by a background job (ADR-011) comparing `now()` to `expected_return_by` |
| `closed_at` | timestamptz | nullable |

- **Cardinality**: 1 `students` ↔ many `library_passes` (one per library visit); 1 `library_passes` ↔ many `qr_sessions`, many `journey_events`.
- **Lifecycle**: created when a student initiates a library visit; `status` → `closed` on hostel-return checkpoint completion.
- **Indexes**: index on `student_id`, partial index on `status = 'active'` (dashboard queries), index on `is_overdue`.
- **Retention**: retained as session history (SDD Ch.6/Ch.8's "session history" requirement).
- **Sensitive fields**: none directly.
- **Ownership**: student owns/reads their own; Reception/Library staff read broadly for dashboard purposes.

### `qr_sessions`
Dynamic, short-lived, one-time-use (SDD Ch.6 §6.3: 30–60s TTL; ADR-003/ADR-014's attestation-adjacent QR-security requirements).

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `library_pass_id` | uuid, FK → `library_passes.id` | not null |
| `checkpoint_type` | enum (`hostel_exit`, `library_entry`, `library_exit`, `hostel_return`) | not null |
| `token_hash` | text | not null — a hash of the signed QR payload, **never the raw signing secret** stored in queryable form |
| `issued_at` | timestamptz | not null |
| `expires_at` | timestamptz | not null — `issued_at` + 30–60s |
| `used_at` | timestamptz | nullable — null means unused; set exactly once (one-time-use enforced by a check/trigger, not just application logic) |
| `used_by_staff_id` | uuid, FK → `staff.id` | nullable — who scanned it |

- **Cardinality**: 1 `library_passes` ↔ 4 `qr_sessions` per full journey (one per checkpoint), potentially more if a scan expires and is regenerated.
- **Lifecycle**: extremely short-lived by design; retained after expiry only as an audit record (not deleted — replay-protection audit trail, SDD Ch.17.3).
- **Indexes**: index on `library_pass_id`; index on `expires_at` (cleanup/expiry-check queries — read-time expiry check is sufficient given the short TTL, no background sweep job required).
- **Sensitive fields**: `token_hash` treated as sensitive (though it's a hash, not the secret itself).
- **Ownership**: student (owner of the pass) can read status; Reception/Library staff can read+update (`used_at`) during scanning; no one can read another student's QR sessions.

### `journey_events`
The actual checkpoint-completion record (distinct from `qr_sessions`, which is the ephemeral verification token).

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `library_pass_id` | uuid, FK → `library_passes.id` | not null |
| `qr_session_id` | uuid, FK → `qr_sessions.id` | not null |
| `checkpoint_type` | enum (`hostel_exit`, `library_entry`, `library_exit`, `hostel_return`) | not null |
| `verified_by_staff_id` | uuid, FK → `staff.id` | not null |
| `biometric_confirmed` | boolean | not null — required `true` per SDD Ch.2 FR-011/Ch.6 §6.2 (every checkpoint requires biometric) |
| `occurred_at` | timestamptz | not null |

- **Cardinality**: 1:1 with the `qr_sessions` row that authorized it (one successful scan → one journey event); many per `library_passes`.
- **Lifecycle**: insert-only — this is the durable "what actually happened" record (duration/lateness are derived by comparing consecutive `journey_events.occurred_at` values, not stored as separate columns).
- **Indexes**: index on `library_pass_id`, index on `occurred_at`.
- **Retention**: retained as session history.
- **Sensitive fields**: none beyond linkage.
- **Ownership**: same as `library_passes`.

---

## Notification Domain

Minimal, per this task's instruction — only what's required for reliable notification/escalation/audit behavior (ADR-010).

### `notifications`
| Field | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `recipient_type` | enum (`parent`, `student`) | not null |
| `recipient_id` | uuid | not null — polymorphic reference to `parents.id` or `students.id` per `recipient_type` (application-enforced, not a DB-level polymorphic FK) |
| `related_leave_request_id` | uuid, FK → `leave_requests.id` | nullable |
| `related_library_pass_id` | uuid, FK → `library_passes.id` | nullable |
| `status` | enum (`queued`, `sent`, `delivered`, `failed`) | not null, default `queued` |
| `retry_count` | smallint | not null, default `0` |
| `sent_at` | timestamptz | nullable |
| `delivered_at` | timestamptz | nullable |

- **Cardinality**: many per recipient; optionally linked to one `leave_requests` or `library_passes` context (or neither, for general notices).
- **Lifecycle**: created by Fastify's notification orchestration (ADR-010); status updates as Expo Push reports delivery.
- **Indexes**: index on (`recipient_type`, `recipient_id`), index on `status` (retry-job queries, ADR-011).
- **Retention**: retained for the 99%-notification-integrity KPI's audit needs (SDD Ch.17.4).
- **Sensitive fields**: none stored directly (payload content is generated at send-time from the related entity, not persisted verbatim here).
- **Ownership**: recipient reads their own; Fastify service-role writes.
- **Pending schema addition, decided but not yet migrated** ([ADR-017](adr/ADR-017-leave-escalation-orchestration-model.md) §5, ADR-018 §1, both ACCEPTED): a `stage` column (the `leave_request_status` enum, or a narrower subset) plus a uniqueness constraint on `(related_leave_request_id, recipient_id, stage)`, so a logical notification for a specific escalation stage/recipient becomes unambiguously identifiable — required before send-level deduplication (ADR-018 §4) can be implemented deterministically. **No `device_id`/`trusted_device_id` column is planned** — multi-device fan-out (ADR-018 §7) is a delivery-attempt detail addressed within a single logical notification, not a reason for a per-device row or column. This migration is an implementation-task prerequisite, not created by any design-only task.

---

## Audit Domain

### `audit_logs`
Generic, cross-domain, **immutable** security/audit trail (SDD Ch.12: "All modules → Audit Logs"). Distinct from and complementary to `leave_approval_events` — see ADR-015.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `actor_type` | enum (`student`, `parent`, `staff`, `system`) | not null |
| `actor_id` | uuid | nullable — null for `system`-generated entries |
| `action` | text | not null — e.g. `device.registered`, `device.revoked`, `auth.session_revoked`, `leave.approved` |
| `entity_type` | text | not null |
| `entity_id` | uuid | not null |
| `metadata` | jsonb | not null, default `{}` — **non-sensitive** structured context only, never secrets/biometric data |
| `occurred_at` | timestamptz | not null |

- **Cardinality**: many rows, unbounded growth — a partitioning/archival strategy is a future operational concern, not decided here.
- **Lifecycle**: insert-only, forever.
- **Indexes**: index on (`entity_type`, `entity_id`), index on `occurred_at`, index on `actor_id`.
- **Retention**: DPDP requires a defined retention policy (SDD Ch.17.4) — exact duration is an operational/legal decision not made in this document; flagged as an unresolved question in the final report.
- **Sensitive fields**: `metadata` must never carry secrets, tokens, or biometric payloads — an application-level discipline enforced by code review, not a DB constraint.
- **Ownership**: no client-side read/write access at all — Fastify service-role writes only; any UI surfacing of audit data goes through a dedicated, RBAC-gated Fastify endpoint, never direct table access.

### `security_incidents`
SDD Ch.2 FR-012's security escalation (missed checkpoint → status prompt → no response → temporary geolocation → notify authorities → **auto-stop location sharing on resolution**).

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `student_id` | uuid, FK → `students.id` | not null |
| `incident_type` | enum (`missed_checkpoint`, `manual_flag`) | not null |
| `status` | enum (`open`, `escalated`, `resolved`) | not null, default `open` |
| `geolocation_captured_at` | timestamptz | nullable — **only populated during an active, unresolved incident** |
| `geolocation_deleted_at` | timestamptz | nullable — set automatically (background job, ADR-011) the moment `status` → `resolved`, per the SDD's explicit auto-stop privacy requirement; the actual coordinate data is deleted at this point, not merely flagged |
| `resolved_at` | timestamptz | nullable |

- **Cardinality**: many per `students` (hopefully rare).
- **Lifecycle**: created on trigger condition; geolocation data (raw coordinates — stored in a separate, tightly-scoped table or column not detailed further here since it's explicitly transient) is actively deleted, not just soft-flagged, on resolution — this is a privacy-by-design requirement, not an optimization.
- **Indexes**: index on `student_id`, index on `status`.
- **Retention**: the incident record itself is retained for audit; geolocation data specifically is deliberately short-lived, per above.
- **Sensitive fields**: geolocation data is the most sensitive field in the entire schema — DPDP purpose-limitation applies strictly (SDD Ch.17.4).
- **Ownership**: student (their own incidents, read-only), Reception/Admin/Library staff (operational access), no one has standing write access to resolve except staff via Fastify business logic.

---

## Cross-Cutting Notes

- **`auth.users` → application profile → role → relationship tables → business resources**: every business table above traces back to `auth.users` through exactly one of `students`/`parents`/`staff`, never directly — this chain is what RLS policies walk (`docs/rls-policy-matrix.md`).
- **Retention/DPDP**: `security_incidents.geolocation_*` is the only field with an active, enforced deletion requirement. `audit_logs` and `leave_approval_events` retention duration is flagged as an unresolved operational/legal question (final report §14).
- **No table stores raw biometric data anywhere in this design.**
