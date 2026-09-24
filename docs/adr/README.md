# Architecture Decision Records — Registry and Lifecycle Policy

This directory holds Architecture Decision Records (ADRs) for DigiHostel. This file is the canonical ADR registry and the authoritative lifecycle policy for how ADRs are created, accepted, changed, and retired.

Accepted ADRs are authoritative implementation constraints. See the enforcement rule in `CLAUDE.md` and `.claude/rules/`.

## Lifecycle

```text
PROPOSED
   ↓
ACCEPTED
   ↓
SUPERSEDED
   ↓
ARCHIVED
```

Also allowed:

```text
PROPOSED → REJECTED
ACCEPTED → DEPRECATED
```

ADRs are never silently deleted. Every status transition is recorded in the ADR itself and in the registry table below.

### Status meanings

**PROPOSED** — A decision is under consideration and is NOT authoritative. It must not be used as an implementation constraint unless explicitly marked as an interim decision.

**ACCEPTED** — The decision is authoritative and MUST be followed by implementation.

**REJECTED** — The proposed decision was considered but explicitly rejected. It remains in the repository for historical context.

**DEPRECATED** — The decision is no longer recommended but has not necessarily been replaced by another ADR. Existing implementation may still depend on it.

**SUPERSEDED** — The decision has been replaced by a newer ADR. The original ADR remains an immutable historical record and MUST contain a clear link to the superseding ADR.

**ARCHIVED** — Historical ADR retained for recordkeeping and no longer relevant to active architecture. Archiving MUST NOT erase its decision history.

## Supersession Rules

An accepted ADR MUST NOT be edited in-place to change its fundamental decision.

If a new architectural decision contradicts an accepted ADR:

1. Create a NEW ADR.
2. Explain why the existing decision is no longer sufficient.
3. Reference the old ADR.
4. Reference all relevant evidence/change in requirements.
5. Record the new decision.
6. Mark the old ADR as `SUPERSEDED`.
7. Add a `Superseded by: ADR-XXXX` reference to the old ADR.
8. Add a `Supersedes: ADR-YYYY` reference to the new ADR.
9. Update the ADR registry (this file).
10. Update affected implementation/specification documentation.
11. Identify migration or compatibility work required.
12. Verify that implementation no longer contradicts the new decision.

Never rewrite history by replacing the old ADR's decision text.

## Required ADR Metadata

Every ADR must contain:

- ADR ID
- Title
- Status
- Date
- Decision
- Context
- Options considered
- Consequences
- Related ADRs

For superseded ADRs, additionally require:

- `Superseded by: ADR-XXXX`
- Supersession date
- Reason for supersession

For superseding ADRs, additionally require:

- `Supersedes: ADR-XXXX`
- Migration/transition implications
- Compatibility implications

Use explicit cross-links between related ADRs. (This follows the general principle of the MADR format: explicit status metadata and explicit links between related decisions.)

## ADR Immutability Rule

Once an ADR reaches `ACCEPTED` status, the following sections MUST NOT be rewritten to change historical meaning:

- Context
- Options considered
- Decision
- Rationale
- Consequences

Permitted changes to an accepted ADR are limited to:

- correcting factual/typographical errors without changing meaning
- adding links
- adding implementation references
- adding supersession metadata
- changing status from accepted → superseded/deprecated/archived

If the decision itself changes, create a new ADR. Do not reinterpret an accepted ADR's meaning by editing it.

## Supersession Impact Analysis

Before accepting a superseding ADR, the following impacts MUST be documented in it:

- **Specification impact** — Does the SDD contradict the new decision?
- **Documentation impact** — Which documents reference the old decision?
- **Code impact** — Which implementation components depend on the old decision?
- **Database impact** — Does the decision affect schema, migrations, persistence, or data?
- **API impact** — Does it change contracts or compatibility?
- **Security impact** — Does it alter authentication, authorization, trust boundaries, privacy, secrets, or attack surface?
- **Deployment impact** — Does it change infrastructure, environments, CI/CD, or operational requirements?
- **Migration impact** — Is migration required?
- **Rollback impact** — Can the new decision be safely rolled back?

A superseding ADR MUST NOT be accepted until these impacts are documented.

## Implementation Rule

Architectural ambiguity must always be resolved in this order:

1. Check existing accepted ADRs.
2. Check whether the proposed change contradicts one.
3. If no contradiction exists, proceed normally.
4. If a contradiction exists, STOP implementation.
5. Perform supersession impact analysis.
6. Create the new ADR.
7. Obtain/record the architectural decision.
8. Mark the old ADR superseded.
9. Update affected documentation.
10. Only then implement the new architecture.

This prevents silently implementing an architecture that contradicts an accepted decision.

## Relationship to the SDD

ADRs do NOT silently rewrite the SDD.

If an ADR resolves a contradiction in the SDD:

- the conflict is documented in the ADR;
- the canonical implementation decision is established in the ADR;
- the affected SDD sections are identified;
- the SDD itself is not modified unless explicitly authorized by the project workflow.

The registry below indicates when an accepted ADR temporarily overrides an unresolved SDD ambiguity. If the SDD is later formally updated, that update must be recorded in the relevant ADR or in `docs/decision-log.md`.

## Registry

| ADR | Title | Status | Supersedes | Superseded By | Scope | Overrides unresolved SDD ambiguity? |
|---|---|---|---|---|---|---|
| [ADR-001](ADR-001-client-application-architecture.md) | Client Application Architecture | ACCEPTED | — | — | Client | Yes — resolves SDD Ch.3 vs Ch.9/10 conflict |
| [ADR-002](ADR-002-database-domain-model.md) | Database Domain Model | ACCEPTED | — | — | Database | Yes — resolves SDD Ch.12 vs Ch.4/5/10 naming conflict; two structural sub-questions remain explicitly open (see ADR-002) |
| [ADR-003](ADR-003-parent-device-verification-scope.md) | Parent Authentication — Device Verification Scope | ACCEPTED — Android platform-attestation leg implemented 2026-09-13, BLOCKED BY PLATFORM/INFRASTRUCTURE DEPENDENCY for physical-device verification (see [implementation report](ADR-003-implementation-report.md)) | — | — | Security / Auth | Yes — resolves SDD Ch.4 vs Ch.17.2 gap on SIM verification and device attestation; SIM verification itself remains an open feasibility question (see ADR-003) |
| [ADR-004](ADR-004-mobile-technology.md) | Mobile Technology | ACCEPTED | — | — | Client | No |
| [ADR-005](ADR-005-backend-architecture.md) | Backend Architecture | ACCEPTED | — | — | Backend | No |
| [ADR-006](ADR-006-data-platform.md) | Data Platform | SUPERSEDED (partial — auth-strategy clause only; data-platform selection stands) | — | ADR-014 | Database / Backend | No |
| [ADR-007](ADR-007-api-architecture.md) | API Architecture | ACCEPTED | — | — | API | No |
| [ADR-008](ADR-008-offline-sync-architecture.md) | Offline Sync Architecture | ACCEPTED | — | — | Client | Yes — fills the SDD's unspecified conflict-resolution gap (Ch.9/10) |
| [ADR-009](ADR-009-realtime-architecture.md) | Realtime Architecture | ACCEPTED | — | — | Backend / Realtime | No |
| [ADR-010](ADR-010-notification-architecture.md) | Notification Architecture | ACCEPTED | — | — | Backend | No |
| [ADR-011](ADR-011-background-job-architecture.md) | Background Job Architecture | ACCEPTED | — | — | Backend | No |
| [ADR-013](ADR-013-deployment-architecture.md) | Deployment Architecture | ACCEPTED (backend-hosting clause only superseded) | — | ADR-021 (backend-hosting clause only) | Deployment | No |
| [ADR-014](ADR-014-supabase-auth.md) | Supabase Auth as Canonical Identity/Authentication Provider | ACCEPTED | ADR-006 (auth-strategy clause only) | — | Security / Auth / Database | No — implementation-detail decision, no SDD ambiguity involved |
| [ADR-015](ADR-015-approval-workflow-data-model.md) | Approval Workflow Data Model | ACCEPTED | — (completes ADR-002's deferred question, does not supersede) | — | Database | Completes, rather than resolves, an SDD terminology ambiguity already logged under ADR-002 |
| [ADR-016](ADR-016-leave-escalation-approval-authority.md) | Leave Escalation Approval-Authority Model | **ACCEPTED (the "`pending` is decidable" clause only, partially superseded by ADR-025 — see notice below)** | — | **ADR-025 (the "`pending` is decidable" clause only)** | Security / Auth / API | Yes — resolves a genuine gap: neither the SDD nor any accepted ADR states whether escalation restricts decision authority; Model C (relationship-authorized, escalation controls priority only) formally accepted, and remains authoritative — see `docs/leave-escalation-notification-design.md` |
| [ADR-017](ADR-017-leave-escalation-orchestration-model.md) | Leave Escalation State-Machine & Race Resolution (Leave Approval Service) | **ACCEPTED (§9 partially superseded by ADR-019 — see notice below)** | — | **ADR-019 (§9's transition-sequencing claims only)** | Backend / Queue / Database (one migration, not yet created, is now a specified prerequisite — see ADR-017's Migration Impact) | Partially — fills mechanics (race resolution, deadline derivation, generation identity, `manual_verification`/`expired` semantics, transaction boundary, recovery) the SDD/ADR-010/ADR-011 left unspecified; **narrowed in scope by a design-correction pass, then finalized and accepted — see ADR-017's Scope Note** and `docs/leave-escalation-notification-design.md`. The exact escalation-interval duration remains a separate, unresolved product decision that does not block this ADR's acceptance |
| [ADR-018](ADR-018-notification-delivery-reliability.md) | Notification Delivery Reliability & Idempotency (Notification Service) | **ACCEPTED** | — | — | Backend / Notification | Yes — resolves send-layer identity/retry/idempotency/dedup/multi-device/privacy mechanics per SDD Ch.11 §11.3's own Leave-Approval-Service vs. Notification-Service split; extracted in scope from an earlier, broader draft of ADR-017 (not a supersession — see ADR-018's Context); depends on ADR-017 §5's migration (not yet created); see `docs/leave-escalation-notification-design.md`. Exact retry-count/backoff values remain a separate, unresolved product decision |
| [ADR-019](ADR-019-leave-escalation-state-sequencing-correction.md) | Leave Escalation State-Sequencing Correction (Partial Supersession of ADR-017 §9) | **ACCEPTED** | **ADR-017 (§9's transition-sequencing claims only — see ADR-017's Superseded-in-part notice)** | — | Backend | Yes — corrects a factual sequencing error (ADR-017 §9 omitted the `in_app_call` stage between `guardian_notified` and `manual_verification`, contradicting FR-007 and the schema's own `DECIDABLE_STATUSES` ordering) and retracts an unevidenced claim (an invented "absolute lifecycle bound" for `expired`); resolves `expired` as staff-triggered only, from `manual_verification`, never by an automatic timer; see `docs/leave-escalation-notification-design.md` |
| [ADR-020](ADR-020-otp-delivery-mechanism.md) | OTP Delivery/Verification Mechanism for Parent Authentication | **ACCEPTED (mechanism only — SMS-provider selection explicitly left open, see the ADR's Open Question section)** | — (completes ADR-014's deferred question, does not supersede) | — | Security / Auth | Completes, rather than resolves, an ADR-014-logged ambiguity (ADR-014 explicitly deferred "how the OTP step itself is delivered"); resolves it as Supabase Auth's native phone-OTP flow, not a custom Fastify-owned OTP system |
| [ADR-021](ADR-021-api-worker-runtime-hosting.md) | API + pg-boss Worker Runtime Hosting | **ACCEPTED** | **ADR-013 (backend-hosting clause only)** | — | Backend / Deployment | No — reconciles two already-accepted ADRs (ADR-013's Vercel hosting choice, ADR-011's pg-boss choice) that were never evaluated together at the runtime/process level; resolves that `apps/api`'s Fastify HTTP server and pg-boss workers share one persistent Node process, which Vercel's serverless execution model cannot host — decides a persistent-process host for both, unchanged application code (F-06A) |
| [ADR-024](ADR-024-reception-dashboard-staff-authentication.md) | Reception Dashboard Staff Authentication Mechanism (Password + MFA) | **ACCEPTED** | — | — | Security / Auth (Web) | No — completes, rather than resolves, a deferred choice (`docs/reception-dashboard-architecture.md` §16 left the staff authentication *mechanism* open); selects Supabase Auth password sign-in + native TOTP MFA (`auth.mfa`), per this task's explicit accepted requirement; extends, not replaces, ADR-014 |
| [ADR-023](ADR-023-reception-dashboard-web-framework.md) | Reception Dashboard Web Framework | **ACCEPTED** | — | — | Client (Web) | No — completes, rather than resolves, a deferred choice (`docs/workspace-structure.md`, `docs/target-architecture.md` both explicitly left the Reception Dashboard's web framework undecided); selects Vite + React + TypeScript SPA over Next.js/Remix; see `docs/reception-dashboard-architecture.md` §12 for the comparison this ADR formalizes |
| [ADR-022](ADR-022-production-backup-dr-strategy.md) | Production Backup & Disaster Recovery Strategy | **ACCEPTED (2026-09-08) — one clause only (the "must reach Option E before/at go-live" expectation) partially superseded by ADR-026, 2026-09-24 — see notice below** — a 2026-09-07 decision-authority review had found a PRODUCT GOVERNANCE GAP (no repository document named who could set RPO/RTO/PITR-retention or accept this ADR); the Product Owner then explicitly established themselves as that authority and supplied RPO=1 hour, RTO=1–4 hours, PITR retention=7 days, plus a qualitative scale-up review trigger — closing the gap by direct decision rather than by discovering pre-existing authority | — | **ADR-026 (the "reach Option E before/at go-live" clause only)** | Database / Operations / Cost | No — completes, rather than resolves, a gap ADR-006 left open (it named "regular backups" as a security property but never selected a specific backup/PITR strategy); target production architecture is Hybrid + PITR (Pro managed daily backups + PITR at the approved 7-day retention, + independent logical backups), both required unconditionally by SDD Ch.12 §12.7/Ch.16 §16.7 — **that requirement itself is unchanged**; see ADR-022's "Not Yet Implemented" and "Addendum: Free-Tier-First Implementation Note" sections, and ADR-026 for the now-live-production deferral decision |
| [ADR-025](ADR-025-parent-decision-authority-excludes-pending.md) | Parent Decision Authority Excludes `pending` (Reception-Initiated Parent Approval Correction) | **ACCEPTED** | **ADR-016 (the "`pending` is decidable" clause only)** | — | Security / Auth / API | No — narrows the status domain ADR-016's already-accepted Model C (relationship-based authority) applies over, in response to the Reception-Initiated Parent Approval correction changing what `pending` itself means; does not reopen ADR-016's Model A/B/C question |
| [ADR-026](ADR-026-interim-production-recovery-risk-acceptance.md) | Interim Production Data-Recovery Risk Acceptance — Deferred PITR/Managed Backup Adoption | **ACCEPTED (2026-09-24)** | **ADR-022 (the "reach Option E before/at go-live" clause only)** | — | Database / Operations / Cost / Governance | No — records a governed, time-bounded exception to ADR-022's target architecture now that real production infrastructure exists and holds a live administrator; does not edit the SDD's own PITR requirement (Ch.12 §12.7/Ch.16 §16.7), does not claim PITR exists, and does not itself certify production for go-live — see ADR-026's "QG-06 Finding Status" section |

ADR-012 was intentionally not created — see `docs/technology-decision-matrix.md`'s testing-stack row; the testing tool choice (Vitest/Playwright/Maestro) does not constrain architecture and was judged not to warrant a dedicated ADR. The number is not reused.

As new ADRs are created, this registry MUST be updated in the same change.

Do not renumber existing ADRs. Do not reuse ADR numbers, including numbers belonging to rejected or archived ADRs.
