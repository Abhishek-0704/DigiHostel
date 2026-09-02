# ADR-002: Database Domain Model

- **ADR ID:** ADR-002
- **Title:** Database Domain Model
- **Status:** ACCEPTED
- **Date:** 2026-09-02
- **Related ADRs:** ADR-001 (Client Application Architecture) — independent decision; the two-app split does not by itself dictate table structure.

## Decision

The canonical entity vocabulary for the DigiHostel database is the table set defined in **SDD Chapter 12 (Database Design and Data Model)**:

`students`, `parents`, `trusted_devices`, `leave_requests`, `approvals`, `library_passes`, `journey_events`, `qr_sessions`, `notifications`, `audit_logs`, `security_incidents`

This matches `docs/database.md`. Module-chapter terminology that names the same real-world concept (`parent_accounts`) is a synonym and is **not** adopted — `parents` is canonical.

However, this ADR does **not** treat Chapter 12's list as a complete or final schema. Two concepts named only in the module chapters describe real, distinct domain behavior that Chapter 12's flat table list does not obviously account for, and must be resolved during actual schema design (a future task), not discarded as mere naming noise:

- **Session/token lifecycle** (Ch.4/Ch.10's `login_sessions`) — distinct from device *registration* (`trusted_devices`). A trusted device is a long-lived record of "this device belongs to this parent"; a login session is a short-lived JWT/token-lifecycle record that can be issued, refreshed, and revoked independently of device trust. Chapter 12 does not enumerate a sessions table. **Future schema design must explicitly decide** whether session state lives in its own table, is embedded in `trusted_devices`, or is handled entirely outside Postgres (e.g., stateless JWT with a revocation list) — this ADR does not make that call, it only records that the concept must not be silently dropped.
- **Approval timeline granularity** (Ch.5/Ch.10's `approval_events` and `approval_history`) — Chapter 5's explicit state machine (`Pending → Father Notified → Mother Notified → Guardian Notified → {Approved / Rejected / In-App Call / Manual Verification / Expired}`) implies an append-only sequence of escalation/response events, which a single `approvals` row (one row per leave request) cannot cleanly represent alongside a queryable per-parent history view. **Future schema design must explicitly decide** whether `approvals` is itself an event-log table (one row per state transition, tied to a `leave_request_id`), or whether a separate `approval_events` table is needed with `approvals`/`leave_requests` holding only current state — and whether "approval history" (a parent's view of past decisions) is a physical table or a derived query. This ADR does not make that call either; it records the requirement so it is not lost.

The canonical vocabulary below is the naming future schema work must use; the two open sub-decisions above are structural, not naming, questions and remain explicitly unresolved by this ADR.

## Context

### Conflicting SDD references

- **SDD Chapter 12 — Database Design and Data Model** is the SDD's dedicated schema chapter. It defines: `students, parents, trusted_devices, leave_requests, approvals, library_passes, journey_events, qr_sessions, notifications, audit_logs, security_incidents`, with relationships and indexing strategy. This matches `docs/database.md` exactly.
- **SDD Chapter 4 — Parent Authentication Module** references `parent_accounts`, `trusted_devices`, `login_sessions`, `audit_logs` as the entities involved in registration/login/device-trust flows.
- **SDD Chapter 5 — Parent Leave Approval Module** references `leave_requests`, `approval_events` (described as a timeline), `approval_history` (described as a parent-facing history view), `audit_logs` — two approval-related concepts, not Chapter 12's single `approvals`.
- **SDD Chapter 10 — Parent Mobile Application** references `parent_accounts`, `trusted_devices`, `approval_history`, `notifications`, `audit_logs` — consistent with Chapter 4/5's terminology, not Chapter 12's.

Chapter 12 is a dedicated schema-design chapter; Chapters 4, 5, and 10 are functional/module-description chapters that reference data concepts narratively, in service of describing user-facing workflows, not as literal DDL. This asymmetry is itself informative: Chapter 12 is the more authoritative source for *table-level naming*, but Chapters 4/5/10 are the more authoritative source for *what data behavior the workflow actually requires* — and in two places, that required behavior does not obviously fit inside Chapter 12's flat list.

## Domain Concepts Identified

| Concept | Chapter 12 term | Module-chapter term | Same entity? |
|---|---|---|---|
| Student record | `students` | — | n/a |
| Parent record | `parents` | `parent_accounts` (Ch.4, Ch.10) | Yes — synonym |
| Device trust registration | `trusted_devices` | `trusted_devices` (Ch.4, Ch.10) | Yes — consistent |
| Session/token lifecycle | *(not enumerated)* | `login_sessions` (Ch.4) | Open — see Decision |
| Leave request | `leave_requests` | `leave_requests` (Ch.5) | Yes — consistent |
| Approval state/timeline | `approvals` | `approval_events` (Ch.5) | Open — see Decision |
| Approval history (parent-facing) | *(not enumerated)* | `approval_history` (Ch.5, Ch.10) | Open — see Decision |
| Library pass | `library_passes` | — | n/a |
| Checkpoint journey | `journey_events` | — | n/a |
| QR session | `qr_sessions` | — | n/a |
| Notification | `notifications` | `notifications` (Ch.10) | Yes — consistent |
| Audit trail | `audit_logs` | `audit_logs` (Ch.4, Ch.5, Ch.10) | Yes — consistent |
| Security incident | `security_incidents` | — | n/a |

## Naming Options Considered

1. **Adopt Chapter 12 verbatim, discard module-chapter terms entirely.** Rejected as too lossy — `login_sessions` and the event/history distinction in approvals describe real behavioral requirements repeated across three module chapters (Ch.4, Ch.5, Ch.10), not one-off phrasing accidents.
2. **Adopt module-chapter terms verbatim, discard Chapter 12.** Rejected — Chapter 12 is the SDD's purpose-built schema chapter with defined relationships and indexing strategy; discarding it in favor of narrative references from functional chapters would lose that structure for no benefit.
3. **Adopt Chapter 12 as the canonical table-naming baseline, while explicitly flagging the two structural gaps it doesn't cover, deferring their resolution to schema-design time.** Selected — preserves the authoritative schema chapter's naming while not silently dropping requirements that three other chapters independently describe.

## Decision (canonical entity terminology)

Use exactly these entity names in all future implementation, documentation, and code:

`students`, `parents`, `trusted_devices`, `leave_requests`, `approvals`, `library_passes`, `journey_events`, `qr_sessions`, `notifications`, `audit_logs`, `security_incidents`

`parent_accounts` is retired in favor of `parents`. `login_sessions` and the `approval_events`/`approval_history` split are **not** retired — they are open structural questions to be settled explicitly during the database implementation task (see `docs/database.md`, `.claude/rules/database.md`), not decided here and not to be silently resolved by whichever name happens to get typed first into a Drizzle schema file.

## Relationship-Level Implications

- `parents` — `trusted_devices`: one-to-many (a parent may register multiple devices), per Ch.4.
- `trusted_devices` — session/token state: relationship type undecided pending the `login_sessions` question above.
- `leave_requests` — `approvals`: relationship cardinality (one summary row vs. one row per state-machine transition) undecided pending the approval-granularity question above; whichever is chosen must still support Ch.5's full state machine and escalation chain (Father → Mother → Guardian → In-App Call → Manual).
- `library_passes` — `journey_events` — `qr_sessions`: one-to-many / one-to-one as already implied by Chapter 12 and consistent with Ch.6's checkpoint flow; no conflict found here.
- All entities remain subject to `audit_logs` per `docs/database.md`'s "All modules → Audit Logs" relationship.

## Consequences

- Anyone writing the Drizzle schema (`lib/db` once recreated) must use this ADR's terminology, not any deleted implementation's prior choices (the deleted schema was empty and made no naming choice, so there is no prior-code conflict to reconcile).
- The two flagged open questions (session lifecycle modeling, approval event/history granularity) must be explicitly decided — with rationale — at the point actual schema design begins; that decision may warrant its own ADR if it turns out to be architecturally significant (e.g., choosing event-sourcing for approvals), per the supersession/new-ADR process in `docs/adr/README.md`.
- `docs/database.md` remains accurate as a high-level reference under this decision and does not require correction as a result of this ADR.

## Rejected Alternatives

- Verbatim Chapter 12 adoption with no flags (Option 1) — rejected as lossy.
- Verbatim module-chapter adoption (Option 2) — rejected as discarding useful schema structure.
- Renaming everything to a "clean slate" vocabulary invented independently of the SDD — not seriously considered; contradicts this project's specification-first governance (`CLAUDE.md`, `workflow.md`).

## Addendum (2026-09-02, added post-acceptance — implementation reference only, does not alter the Decision/Context/Rationale above)

Both structural questions this ADR left open are now resolved: **session/token lifecycle** is owned natively by Supabase Auth (ADR-014) — no `login_sessions` application table is implemented. **Approval event/history granularity** is resolved by ADR-015 (Approval Workflow Data Model) — `leave_requests` (current state) + `leave_approval_events` (immutable event log), not a standalone `approvals` table. ADR-015 completes rather than supersedes this ADR.
