# ADR-015: Approval Workflow Data Model

- **ADR ID:** ADR-015
- **Title:** Approval Workflow Data Model
- **Status:** ACCEPTED
- **Date:** 2026-09-02
- **Related ADRs:** ADR-002 (Database Domain Model — this ADR **completes**, not supersedes, ADR-002's explicitly-deferred approval-granularity question; ADR-002's canonical vocabulary and its `parents`/`trusted_devices`/etc. naming are unaffected), ADR-014 (Supabase Auth — establishes the identity substrate this model attaches to).

This is not a supersession — ADR-002 explicitly anticipated this exact resolution ("may warrant its own ADR if it turns out to be architecturally significant") and left the question open rather than deciding it. No accepted ADR text is contradicted.

## Decision

The `approvals` table named in ADR-002's canonical vocabulary is **not implemented as a separate table**. Instead:

1. **`leave_requests`** carries current approval state directly (a `status` column reflecting the SDD Ch.5 state machine: `pending`, `father_notified`, `mother_notified`, `guardian_notified`, `approved`, `rejected`, `in_app_call`, `manual_verification`, `expired`) plus the core request fields (student, dates, reason).
2. **`leave_approval_events`** (new name, replacing both `approval_events` and `approval_history` from ADR-002's open question) is an **append-only, immutable** table — one row per state transition (notification sent, response received, escalation, expiry). This single table serves both purposes SDD Ch.5/Ch.10 described separately: it *is* the escalation timeline (`approval_events`), and a parent's "approval history" view is simply a filtered/joined query over it — not a separate physical table.

There is no standalone `approvals` table and no standalone `approval_history` table.

## Context

ADR-002 identified that Chapter 5's explicit state machine (`Pending → Father Notified → Mother Notified → Guardian Notified → {Approved / Rejected / In-App Call / Manual Verification / Expired}`) implies an append-only event sequence that a single `approvals` row per leave request can't cleanly represent alongside a queryable history view, and left the exact structural resolution open pending schema-design time. This ADR is that resolution.

## Options Considered

1. **Single `approvals` table** (one row per leave request, mutated in place as the state machine progresses) — the literal reading of SDD Ch.12's flat table list. Rejected: mutating a row in place to represent a multi-step state machine destroys the audit trail Ch.5's escalation chain implies (you'd lose "when was Father notified" once the row moves to "Mother Notified") — unacceptable given SDD Ch.12's "All modules → Audit Logs" requirement and this project's general auditability mandate (`.claude/rules/security.md`).
2. **`leave_requests` (current state) + separate `approvals` (event log) + separate `approval_history` (materialized/denormalized parent-facing view)** — the most literal reading of the module chapters' three distinct terms. Rejected: `approval_history` as a *physical* table would just be a redundant, sync-burdened copy of what's already queryable from the event log — introducing a data-consistency risk (the two could drift) for no benefit over a view/query.
3. **`leave_requests` (current state, mutable `status` column) + `leave_approval_events` (append-only event log, serves both "events" and "history")** — selected. Merges ADR-002's `approvals` concept into `leave_requests` itself (a leave request has exactly one approval process — a 1:1 relationship that doesn't justify a separate table), and merges the `approval_events`/`approval_history` distinction into one honestly-named event log, since "history" is just a read pattern over "events," not a separate write-time concept.

## Decision Detail

`leave_requests` columns (illustrative, not final DDL — actual column types/constraints are a schema-implementation task): `id`, `student_id` (FK), `requested_by`, `reason`, `start_date`, `end_date`, `status` (enum, current state machine position), `created_at`, `updated_at`.

`leave_approval_events` columns (illustrative): `id`, `leave_request_id` (FK), `event_type` (`notified` | `responded` | `escalated` | `expired` | `manual_override`), `actor` (which parent/guardian/staff member, nullable for system-generated events like auto-escalation), `response` (`approved` | `rejected` | `no_response`, nullable), `biometric_confirmed` (boolean, required true for any `approved`/`rejected` response per SDD Ch.5 §5.2's biometric-gated approval requirement), `occurred_at`. **Immutable**: rows are inserted only, never updated or deleted — enforced at the RLS layer (`docs/rls-policy-matrix.md`), not merely by application convention.

This event log coexists with, and is distinct from, the domain-wide `audit_logs` table (ADR-002): `audit_logs` is the generic, cross-domain security/audit trail (login events, device changes, admin actions); `leave_approval_events` is a typed, structured, business-logic-relevant log specifically for rendering approval timelines and driving escalation-timer logic (ADR-011). Both may reference the same underlying event for cross-cutting audit queries, but neither replaces the other.

## Session/Token Modeling — Resolved as a Direct Consequence of ADR-014

The other question ADR-002 left open (`login_sessions`) is resolved without requiring its own ADR, since ADR-014 already made the load-bearing decision: **Supabase Auth owns session/token lifecycle natively** (its internal `auth.sessions`/`auth.refresh_tokens` tables, not exposed to or duplicated by the application schema). DigiHostel does **not** implement its own `login_sessions` table. The only application-level table in this area is `trusted_devices` (device *registration*, long-lived, distinct from session lifecycle — per `docs/auth-database-security-model.md` §6), which is unaffected by this ADR. This resolution is recorded here, and cross-referenced from ADR-002, rather than requiring a separate document, because it involves no independent judgment call beyond applying ADR-014.

## Consequences

- `docs/database-schema-design.md` and all future schema implementation must use `leave_requests` + `leave_approval_events`, not `approvals`/`approval_history` as separate physical tables.
- `docs/database.md`'s high-level entity list (which still says `approvals`) becomes imprecise at the implementation level — flagged for a follow-up correction (see final report), not fixed here to keep this ADR's scope to the decision itself.
- Escalation-timer background jobs (ADR-011, pg-boss) read/write `leave_approval_events` to drive the Father→Mother→Guardian→In-app-call→Manual sequence and update `leave_requests.status` accordingly.
- RLS policies must make `leave_approval_events` insert-only for all non-service-role actors (no `UPDATE`/`DELETE` grants ever), per its immutability requirement.

## Rejected Alternatives

Single mutable `approvals` table (destroys audit trail); three-table split with a physical `approval_history` (redundant, drift-risk) — both above.
