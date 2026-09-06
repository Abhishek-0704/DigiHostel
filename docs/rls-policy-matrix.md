# RLS Policy Matrix

Every table in `docs/database-schema-design.md` that is exposed to the Supabase Data API (i.e. not accessed exclusively via Fastify's service-role connection) has RLS **enabled and forced** (`ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`, so even the table owner is subject to policy). RLS is the final database authorization boundary (`docs/auth-database-security-model.md`) — it does not replace Fastify's business-authorization layer, it backstops it.

**Relationship-based authorization always walks live PostgreSQL joins** (e.g. through `parent_student_relationships`) — never a JWT claim, per the Critical Rule established in the prior task and re-stated in `docs/database-schema-design.md`.

Legend: ✅ allowed (with condition noted), ❌ denied, — not applicable to that table.

## `students`

| Actor | SELECT | INSERT | UPDATE | DELETE | Authorization basis |
|---|---|---|---|---|---|
| anonymous | ❌ | ❌ | ❌ | ❌ | no policy grants anonymous access |
| student (self) | ✅ own row | ❌ | ✅ own row, limited columns (not `roll_number`, `hostel_id`, `room_id`) | ❌ | `auth_user_id = auth.uid()` |
| parent/guardian | ✅ linked students only | ❌ | ❌ | ❌ | `EXISTS (... parent_student_relationships WHERE parent_id = <caller's parents.id> AND student_id = students.id)` |
| reception | ✅ students in own hostel | ❌ | ❌ | ❌ | `students.hostel_id = <caller's staff.hostel_id>` |
| library_incharge | ✅ all | ❌ | ❌ | ❌ | role claim; library operations are not hostel-scoped |
| hostel_admin | ✅ own hostel | ✅ own hostel | ✅ own hostel | ❌ | `students.hostel_id = <caller's staff.hostel_id>` |
| super_admin | ✅ all | ✅ all | ✅ all | ❌ delete never allowed via RLS (Fastify service-role only, if ever) | role claim |

## `parents`

| Actor | SELECT | INSERT | UPDATE | DELETE | Authorization basis |
|---|---|---|---|---|---|
| anonymous | ❌ | ❌ | ❌ | ❌ | |
| parent/guardian (self) | ✅ own row | ❌ | ✅ own row | ❌ | `auth_user_id = auth.uid()` |
| student | ❌ | ❌ | ❌ | ❌ | students never read parent profile rows directly (Fastify surfaces only what's needed, e.g. escalation-chain display, via a scoped endpoint) |
| reception / library_incharge | ❌ | ❌ | ❌ | ❌ | no operational need for direct table access |
| hostel_admin / super_admin | ✅ all | ✅ | ✅ | ❌ | role claim |

## `staff`

| Actor | SELECT | INSERT | UPDATE | DELETE | Authorization basis |
|---|---|---|---|---|---|
| anonymous | ❌ | ❌ | ❌ | ❌ | |
| staff (self) | ✅ own row | ❌ | ✅ own row, limited columns (not `role`, `hostel_id`) | ❌ | `auth_user_id = auth.uid()` |
| any other authenticated | ❌ | ❌ | ❌ | ❌ | staff directory is not broadly readable |
| super_admin | ✅ all | ✅ | ✅ (incl. `role`/`hostel_id`) | ❌ | role claim — only super_admin provisions/reassigns staff |

## `parent_student_relationships`

| Actor | SELECT | INSERT | UPDATE | DELETE | Authorization basis |
|---|---|---|---|---|---|
| anonymous | ❌ | ❌ | ❌ | ❌ | |
| student | ✅ own rows (which parents are linked to me) | ❌ | ❌ | ❌ | `student_id = <caller's students.id>` |
| parent/guardian | ✅ own rows | ❌ | ❌ | ❌ | `parent_id = <caller's parents.id>` |
| reception / library_incharge | ❌ | ❌ | ❌ | ❌ | not needed operationally |
| hostel_admin | ✅ own-hostel students' relationships | ✅ | ✅ | ❌ | joined through `students.hostel_id` |
| super_admin | ✅ all | ✅ | ✅ | ❌ | role claim |

## `hostels`, `rooms`

| Actor | SELECT | INSERT | UPDATE | DELETE | Authorization basis |
|---|---|---|---|---|---|
| anonymous | ❌ | ❌ | ❌ | ❌ | not public |
| any authenticated | ✅ all | ❌ | ❌ | ❌ | reference data, low sensitivity |
| hostel_admin / super_admin | ✅ | ✅ | ✅ | ❌ | role claim |

## `student_room_assignments`

| Actor | SELECT | INSERT | UPDATE | DELETE | Authorization basis |
|---|---|---|---|---|---|
| anonymous | ❌ | ❌ | ❌ | ❌ | |
| student (self) | ✅ own | ❌ | ❌ | ❌ | `student_id = <caller's students.id>` |
| parent/guardian | ✅ linked students' | ❌ | ❌ | ❌ | via `parent_student_relationships` join |
| reception / hostel_admin | ✅ own hostel | ✅ | ✅ (`ended_at`) | ❌ | via `rooms.hostel_id` |
| super_admin | ✅ all | ✅ | ✅ | ❌ | role claim |

## `leave_requests`

| Actor | SELECT | INSERT | UPDATE | DELETE | Authorization basis |
|---|---|---|---|---|---|
| anonymous | ❌ | ❌ | ❌ | ❌ | |
| student (self) | ✅ own | ✅ own (creates the request) | ❌ (status transitions happen via `leave_approval_events` + Fastify, not direct student edits) | ❌ | `student_id = <caller's students.id>` |
| parent/guardian | ✅ linked students' | ❌ | ✅ **status only**, and only when linked via `parent_student_relationships` — this row's original text ("the party matching the current escalation step") predated the actual implementation and was wrong; corrected, and now the **formally accepted design** per [ADR-016](adr/ADR-016-leave-escalation-approval-authority.md) (ACCEPTED, Model C — escalation controls notification priority only). Any linked parent/guardian — regardless of `relationship_type` or `escalation_order` — may decide a request in any decidable status. Neither RLS (`leave_requests_update_linked_parent`) nor Fastify (`LeaveService.decide()`/`DrizzleLeaveRepository.decide()`) restricts this further. | ❌ | join through `parent_student_relationships` |
| reception | ✅ own-hostel students' | ✅ (manual-fallback creation) | ✅ (`leave_requests_all_reception`, `for: "all"` — **the actual policy grants any update to own-hostel students' rows, not restricted to `manual_verification` at the SQL level**; this column's "manual_verification path only" phrasing is the *intended business use*, primarily resolving `manual_verification` → `approved`/`rejected`/`expired`, per [ADR-019](adr/ADR-019-leave-escalation-state-sequencing-correction.md) — `expired` specifically is reached only via this explicit staff action, never an automatic timer) | ❌ | via `students.hostel_id` |
| library_incharge | ❌ | ❌ | ❌ | ❌ | not relevant to library operations |
| hostel_admin | ✅ own hostel | ❌ | ✅ own hostel | ❌ | via `students.hostel_id` |
| super_admin | ✅ all | ❌ | ✅ all | ❌ | role claim |

## `leave_approval_events` (immutable)

| Actor | SELECT | INSERT | UPDATE | DELETE | Authorization basis |
|---|---|---|---|---|---|
| anonymous | ❌ | ❌ | ❌ | ❌ | |
| student (self) | ✅ own leave requests' events | ❌ | ❌ | ❌ | via `leave_requests.student_id` |
| parent/guardian | ✅ linked students' events | ✅ **insert-only**, `responded` events, and only with `biometric_confirmed = true` and an active trusted device when `response` is set — enforced by this policy (`lae_insert_own_parent_response`) | ❌ **never** | ❌ **never** | join through `parent_student_relationships` — the actual policy SQL (`packages/db/src/schema/leave.ts`) checks `actor_parent_id = caller`, relationship existence (any `relationship_type`), `biometric_confirmed`, and active-trusted-device — it does **not** compare `relationship_type`/`escalation_order` against the request's current status. This row's prior "re-validates escalation-order match" text was inaccurate, matching the same stale assumption corrected on the `leave_requests` row above; the accepted design is [ADR-016](adr/ADR-016-leave-escalation-approval-authority.md) (ACCEPTED, Model C) |
| reception | ✅ own-hostel | ✅ insert-only (`manual_override`) | ❌ | ❌ | via `students.hostel_id` |
| hostel_admin / super_admin | ✅ | ✅ insert-only | ❌ | ❌ | role claim — **no role may ever UPDATE or DELETE this table; immutability is enforced at the policy level, not merely by convention** |

## `trusted_devices`

**Remediated (PRR Phase 13, Finding F-01):** the RLS layer previously granted `authenticated` a self-service INSERT policy (`trusted_devices_insert_own`, `WITH CHECK parent_id = caller` only) that this row's own text described as "post-attestation, via Fastify-mediated flow" without the policy actually enforcing that — any authenticated parent could self-insert a fully active device row with no attestation whatsoever. That policy has been removed entirely (`supabase/migrations/0003_f01_trusted_devices_rls_remediation.sql`). RLS cannot itself verify a Play Integrity/App Attest result, so **no `authenticated`-role INSERT policy on this table can ever be correct** — device registration, once implemented, must write through the backend's own privileged (RLS-bypassing) connection, exactly like `device_attestation_events`'s insert path below, never through a client-facing policy.

| Actor | SELECT | INSERT | UPDATE | DELETE | Authorization basis |
|---|---|---|---|---|---|
| anonymous | ❌ | ❌ | ❌ | ❌ | |
| parent (self) | ✅ own devices | ❌ — no client INSERT path exists; a real registration flow must be backend-mediated (Fastify service-role, post-attestation), never a client-facing RLS policy | ✅ own — `revoked_at`/`revoked_reason` only, one-way active → revoked (never the reverse), no other column may change in the same statement | ❌ | `parent_id = <caller's parents.id>`; the one-way transition and column restriction are enforced by `trusted_devices_revoke_own`'s `USING`/`WITH CHECK` plus the `trusted_devices_revoke_only` trigger |
| anyone else (incl. guardian for a *different* parent's devices) | ❌ | ❌ | ❌ | ❌ | device trust is strictly per-parent, never shared |
| super_admin | ✅ all (incident response) | ⚠️ policy grants `FOR ALL` (see note) | ✅ (see note) | ❌ | role claim — **note:** the current `trusted_devices_all_super_admin` policy is broader than this row's own INSERT/UPDATE-scope claims (it does not itself restrict INSERT or column-level UPDATE the way the table above implies); this pre-existing discrepancy was observed during the F-01 remediation but is a separate, unrelated finding, not part of F-01, and was deliberately left unchanged — see the F-01 remediation report |

## `device_attestation_events` (immutable)

| Actor | SELECT | INSERT | UPDATE | DELETE | Authorization basis |
|---|---|---|---|---|---|
| anonymous | ❌ | ❌ | ❌ | ❌ | |
| parent (self) | ✅ own devices' events | ❌ (Fastify service-role writes only) | ❌ | ❌ | via `trusted_devices.parent_id` |
| all other actors | ❌ | ❌ (except service-role, which bypasses RLS entirely) | ❌ | ❌ | insert-only, backend-authored |

## `library_passes`, `journey_events`

| Actor | SELECT | INSERT | UPDATE | DELETE | Authorization basis |
|---|---|---|---|---|---|
| anonymous | ❌ | ❌ | ❌ | ❌ | |
| student (self) | ✅ own | ✅ own (`library_passes` creation) | ❌ | ❌ | `student_id = <caller's students.id>` |
| parent/guardian | ✅ linked students' (visibility only — SDD gives parents read access to library status, not write) | ❌ | ❌ | ❌ | join through `parent_student_relationships` |
| reception | ✅ own hostel | ✅ (`journey_events` at hostel checkpoints) | ✅ (`library_passes.status`/`is_overdue`) | ❌ | via `students.hostel_id` |
| library_incharge | ✅ all | ✅ (`journey_events` at library checkpoints) | ✅ (`library_passes.status`) | ❌ | role claim — not hostel-scoped |
| hostel_admin / super_admin | ✅ | ❌ | ✅ | ❌ | role claim |

## `qr_sessions`

| Actor | SELECT | INSERT | UPDATE | DELETE | Authorization basis |
|---|---|---|---|---|---|
| anonymous | ❌ | ❌ | ❌ | ❌ | |
| student (self) | ✅ own (to display the active QR) | ❌ (Fastify service-role generates) | ❌ | ❌ | via `library_passes.student_id` |
| reception / library_incharge | ✅ (to validate a scan) | ❌ | ✅ (`used_at`, `used_by_staff_id`) on scan | ❌ | operational — checkpoint-scanning role |
| everyone else | ❌ | ❌ | ❌ | ❌ | tightly scoped — this is the highest-replay-risk table in the schema |

## `notifications`

| Actor | SELECT | INSERT | UPDATE | DELETE | Authorization basis |
|---|---|---|---|---|---|
| anonymous | ❌ | ❌ | ❌ | ❌ | |
| recipient (student or parent, self) | ✅ own | ❌ (Fastify service-role writes) | ❌ | ❌ | `(recipient_type, recipient_id)` matches caller |
| staff (any role) | ❌ | ❌ | ❌ | ❌ | not staff-facing data |
| super_admin | ✅ all (support/debugging) | ❌ | ❌ | ❌ | role claim |

## `audit_logs` (immutable, no client access at all)

| Actor | SELECT | INSERT | UPDATE | DELETE | Authorization basis |
|---|---|---|---|---|---|
| anonymous | ❌ | ❌ | ❌ | ❌ | |
| student / parent / staff (any role, incl. super_admin) | ❌ | ❌ | ❌ | ❌ | **no RLS policy grants any client-side access whatsoever** — only Fastify's service-role connection (which bypasses RLS entirely) reads/writes this table; any UI surfacing goes through a dedicated, separately-authorized Fastify endpoint, never direct table access |

## `security_incidents`

| Actor | SELECT | INSERT | UPDATE | DELETE | Authorization basis |
|---|---|---|---|---|---|
| anonymous | ❌ | ❌ | ❌ | ❌ | |
| student (self) | ✅ own, **excluding raw geolocation columns** (column-level restriction via a view or column privileges, not RLS row-filtering) | ❌ | ❌ | ❌ | `student_id = <caller's students.id>` |
| parent/guardian | ✅ linked students', same column restriction | ❌ | ❌ | ❌ | join through `parent_student_relationships` |
| reception / library_incharge | ✅ own-hostel/all respectively, **including geolocation while incident is open** (operational necessity) | ✅ (`missed_checkpoint` auto-trigger path via Fastify) | ✅ (`status` transitions) | ❌ | role claim + hostel scope |
| hostel_admin / super_admin | ✅ full access | ✅ | ✅ | ❌ | role claim |

---

## Notes on JWT Claims Used Above

Only two claim references appear anywhere in this matrix: the caller's coarse `app_role` (student/parent/staff-role) and their own profile id (`parent_id`/`student_id`/`staff_id`), per `docs/auth-database-security-model.md` §13. Every other authorization decision above — every "linked students," "own hostel," "own devices" — is a live PostgreSQL join, never a claim. This is deliberate and matches the Critical Rule stated in this task.

## Testing Requirement (implemented in `supabase/tests/`)

Per Supabase's current guidance (RLS should be enabled on every exposed table, with explicit tests per operation), every ❌ cell above has a corresponding negative test, and every conditional ✅ has a corresponding positive test with the condition actually constructed (not just "logged in as the right role" — the relationship row must actually exist for a ✅ to be tested honestly). See `supabase/tests/` and the final report §10.
