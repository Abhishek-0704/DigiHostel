# ADR-026: Interim Production Data-Recovery Risk Acceptance (Partial Supersession of ADR-022)

- **ADR ID:** ADR-026
- **Title:** Interim Production Data-Recovery Risk Acceptance — Deferred PITR/Managed Backup Adoption
- **Status:** **ACCEPTED (2026-09-24)** — recorded via direct instruction from the same Product Owner authority ADR-022 itself established for DigiHostel's RPO/RTO/PITR decisions ("the Product Owner is the authority for DigiHostel's RPO/RTO/PITR product decisions," ADR-022 §"Decision authority"). This ADR is accepted on the identical basis every other ACCEPTED ADR in this repository has used (the decision being made and recorded, with no additional sign-off ceremony this repository's own governance defines) — see "Decision Authority and Acceptance Record" below for the precise evidence trail, recorded with the same honesty ADR-022 itself used rather than assumed.
- **Date:** 2026-09-24
- **Supersedes:** ADR-022 (one clause only — the expectation that production must reach the Option E / Pro+PITR target *before or at* production go-live, and the implication that production operating without it constitutes an unaddressed gap rather than a governed decision. ADR-022's Context, the SDD requirement analysis, the approved RPO/RTO/retention values, Options A–E, the Cost analysis, and the Product-Owner decision-authority finding are **all unaffected and remain in force** — see "Supersession Scope" below for the exact boundary.)
- **Related ADRs:** ADR-006 (Data Platform — Supabase, unaffected), ADR-022 (Production Backup & Disaster Recovery Strategy — partially superseded, see above), ADR-021 (API + pg-boss Worker Runtime Hosting — unaffected, explicitly notes DR posture is independent of API runtime hosting).

## Context

Since ADR-022 was accepted (2026-09-08), the situation it was written against has changed in exactly the one way its own text flagged as the actual production-launch trigger: **a real, live production environment now exists.**

Specifically, and verified live as of this ADR:

- A genuinely separate production Supabase project exists: `asphlfoikqyaeslmhrah` (`ap-southeast-2`), distinct from the staging project `lhonrqjmlhlehpbxvrag` ADR-022's Context section described.
- A production Render API service (`digihostel-api-production`) and a production Vercel frontend (`digihostel-reception-dashboard.vercel.app`) are live, deployed via a repeatable, GitHub Actions-controlled release path (F-QG06-11, CLOSED).
- All 26 committed migrations are applied to the production project (`26/26`, zero drift), all 27 public tables have RLS enabled, and the `supabase_realtime` publication is populated identically to staging.
- A real production administrator (`super_admin`) has been provisioned and independently verified end to end: password authentication, native TOTP MFA, AAL2, RBAC-authorized access to the staff directory/Monitoring Center/audit trail, and Force Sign-Out — all exercised against real production data, with database-level confirmation (F-QG06-09, CLOSED).
- **Production PITR remains disabled and managed backups remain absent**, re-verified live immediately before this ADR: `{"pitr_enabled": false, "backups": []}` (Supabase Management API, `GET /v1/projects/asphlfoikqyaeslmhrah/database/backups`).

ADR-022 itself already anticipated this exact moment and named it precisely: its "Migration Impact" section states that adopting ADR-022 "at production-provisioning time means starting directly on Pro + PITR rather than starting on Free and upgrading later, **avoiding a window of SDD-non-compliant backup coverage in production**." Production provisioning has now happened. The Pro+PITR purchase has not. **DigiHostel is, right now, inside exactly the window ADR-022 said it intended to avoid.**

The independent QG-06 production-readiness certification (2026-09-24) identified this precisely as the sole remaining blocking finding — **F-QG06-01** — and further found that the account owner's verbal decision not to upgrade to Supabase Pro at this time had not been formalized through this repository's own required governance process for changing an accepted ADR's decision (`docs/adr/README.md`: "An accepted ADR MUST NOT be edited in-place to change its fundamental decision... If a new architectural decision contradicts an accepted ADR: 1. Create a NEW ADR... 6. Mark the old ADR as SUPERSEDED"). This ADR is that governance step.

**The SDD's own requirement has not changed.** SDD Ch.12 §12.7 and Ch.16 §16.7 still state PITR as a mandatory, unqualified production capability, exactly as ADR-022 found. This ADR does not reinterpret, weaken, or dispute that SDD text — it records a **deliberate, time-bounded exception** to reaching SDD compliance immediately, not a claim that the requirement no longer applies. See "SDD Relationship" below.

## Decision

**The project temporarily accepts the absence of managed Supabase PITR and managed daily backups in the current, live production environment, and defers adoption of ADR-022's Option E (Hybrid + PITR) until the already-approved scale-up trigger (ADR-022, "Scale-up review trigger") is reached.**

This is not a claim that backups are unnecessary, that the current posture is equivalent to Option E, or that the SDD requirement has been satisfied, reduced, or waived. It is a statement that the identified risk — production data may be permanently unrecoverable from a destructive event — is understood and knowingly accepted for the present, in preference to incurring the recurring cost of Option E before there is operational or business justification for it.

### What does NOT change

- The target production architecture remains ADR-022's Option E (Supabase Pro managed daily backups + PITR at 7-day retention + the independent, scheduled logical-backup script), unchanged in every technical and cost detail.
- The approved targets — RPO 1 hour, RTO 1–4 hours, PITR retention 7 days — remain the approved values for whenever Option E is actually adopted. This ADR does not relax, renegotiate, or invalidate any of them.
- The Product Owner decision-authority finding (ADR-022, "Decision authority") is unchanged and is in fact the exact authority this ADR itself relies on.
- Every other certified security/architecture boundary (authentication, MFA, AAL2, RBAC, RLS, hostel isolation, audit, Force Sign-Out, production deployment controls) is completely unaffected — see "Security Impact" below.

### What DOES change

- ADR-022's implicit expectation that production would never knowingly operate in an SDD-non-compliant backup posture is superseded. Production now does, by explicit decision, until the scale-up trigger is reached.
- **F-QG06-01 is not closed by this ADR.** Its technical condition — no PITR, no managed backups — is unchanged and remains CRITICAL by objective measure. What changes is its governance status: from an unaddressed gap to a knowingly, explicitly accepted risk with an identified owner and a defined (if qualitative) revisit trigger. See "QG-06 Finding Status" below.

## Supersession Scope

Precisely, and only, the following sentence-level implications of ADR-022 are superseded:

1. The "Migration Impact" section's statement that adopting ADR-022 "at production-provisioning time" avoids ever operating production in an SDD-non-compliant backup window. **Superseded**: production now does operate in that window, by explicit decision, not by oversight.
2. Any reading of "Consequences" (*"whoever owns the future production Supabase project budget must still approve a recurring Pro + PITR (7-day) subscription before go-live"*) as a hard precondition to go-live. **Superseded**: go-live (in the sense of a real, live, deployed production environment existing, per the Context above) has occurred without that approval; this ADR is what replaces "before go-live" with "deferred to the scale-up trigger."

**Nothing else in ADR-022 is altered, reinterpreted, or weakened.** Its Context, SDD requirement table, Options A–E analysis, Cost analysis, Decision Criteria Ranking, PITR Retention Tier Analysis, Rationale, both prior Addenda (Free-Tier-First Implementation Note; PITR Classification Correction), and the Decision-authority finding all stand exactly as written and remain the authoritative record of what DigiHostel's production DR architecture will be once adopted.

## Risk

The following risks are real, current, and not reduced by anything in this ADR:

- **Destructive database operation** (an errant `DELETE`/`UPDATE` run with elevated privileges, whether accidental or malicious) is currently **unrecoverable** in production.
- **Accidental deletion** of any production row or table is currently **unrecoverable**.
- **A destructive migration** (one with an unintended data-loss side effect, despite this project's forward-fix-only migration discipline and zero-drift track record to date) would be **unrecoverable** for any data it affected.
- **Infrastructure or database-level failure** on Supabase's platform has no point-in-time recovery fallback specific to this project — DigiHostel depends entirely on whatever platform-wide resilience Supabase's Free tier itself provides, which this ADR does not characterize further (that characterization belongs to Supabase's own SLA/documentation, not this repository).
- **Recovery objectives are materially weaker than the approved target.** With PITR, the approved RPO is 1 hour and RTO is 1–4 hours (both still unverified operationally, per ADR-022). Without PITR, there is no defined RPO/RTO at all — the honest current RPO is **unbounded** (data since the last, if any, logical backup — see "Actual Current Recovery Capability" below), and RTO is undefined.
- **Production data at stake, concretely** (verified against the actual current schema, not a hypothetical list): student identity and roll numbers, staff identities and role assignments, parent/guardian identity and relationship records, leave-request content and their full approval-event history, exit-authorization and hostel-movement records, emergency and health-case records (including geolocation data captured for security incidents), notification-delivery records, audit logs, and administrative configuration entries. This is real personal data, in some categories (health, emergency/security-incident) sensitive personal data, whose loss would have genuine operational and, for the DPDP-relevant categories, regulatory consequence — not merely an inconvenience.

## Actual Current Recovery Capability (do not overstate)

Per this ADR's own instruction to inspect before claiming, the following was verified against the actual repository state:

- `supabase/scripts/backup.mjs` exists, is credential-safe (embeds no secrets, git-ignored output — verified in F-04's own security checklist, unchanged), and has been demonstrated to work end-to-end against a local/staging target in prior verification passes.
- **It has never been run against the production project (`asphlfoikqyaeslmhrah`), is not scheduled, has no off-site storage destination configured, and has no automated verification.**
- Classification: **AVAILABLE BUT NOT OPERATIONAL.** This is deliberately not called a "production backup system" — an unscheduled, unrun script is a capability, not a control. If this script were actually scheduled and run against production, it would provide *some* genuine recovery capability (a discrete, operator-controlled, off-Supabase-platform copy) at materially lower cost than Option E, and would be a legitimate, real improvement over today's actual state — but that has not happened, and this ADR does not claim otherwise.
- **Today's genuine current recovery capability for production data, if lost, is: none.**

## Mitigations actually in place (not backups, but relevant risk-reducing controls)

- Forward-fix-only migration discipline with a 26/26, zero-drift track record across every migration this project has ever written — reduces, but does not eliminate, the likelihood of a destructive migration.
- Row-Level Security enabled on all 27 public tables, independently verified live — reduces the likelihood of unauthorized data mutation, but does nothing for an authorized-but-mistaken or malicious mutation by a legitimate `service_role`/`super_admin` actor.
- A single, deliberately provisioned production administrator, MFA-gated at AAL2 — reduces (but, per the Risk section above, does not eliminate) the population of actors capable of a destructive administrative action.
- The production CI deployment path (F-QG06-11) requires migrations to succeed before any API deployment proceeds, and the migration mechanism itself is the sole authoritative one for production (Supabase's dashboard-side GitHub Integration status on the production project remains genuinely unverified — F-QG06-13, unchanged, tracked separately) — reduces, but does not eliminate, the risk of an unreviewed schema change reaching production.

None of these substitute for a backup. They are recorded here so this ADR does not imply production has *no* risk controls at all — only that it specifically lacks data-recovery capability.

## Future Migration Plan

```
Today
  │  Supabase Free/current tier on the production project
  │  No managed PITR, no managed backups
  │  Risk explicitly identified (this ADR) and accepted (Product Owner)
  ▼
Scale-up review trigger reached (ADR-022's own qualitative trigger, unchanged —
  see below; reused verbatim, not redefined by this ADR)
  ▼
Product Owner re-affirms or revises the RPO/RTO/PITR-retention targets
  (1 hour / 1–4 hours / 7 days, per ADR-022, pending re-confirmation at
  that time — see "Pricing/values are not permanent" caveat, ADR-022's own
  PITR Classification Correction addendum)
  ▼
Supabase Pro + PITR purchased and enabled on the production project
  ▼
supabase/scripts/backup.mjs scheduled and verified against production
  (the independent, off-platform half of ADR-022's Option E)
  ▼
A real production restore drill is performed and its result — not an
  assumption — becomes the operationally-demonstrated RPO/RTO
  ▼
F-QG06-01 reassessed for genuine technical closure
```

### Trigger categories (reused from ADR-022, not redefined)

This ADR does not invent a new trigger — it reuses ADR-022's own qualitative "Scale-up review trigger" verbatim: DR requirements must be revisited "when DigiHostel materially scales or its operational/data-criticality requirements change," considering at minimum RPO, RTO, PITR retention, backup frequency, restore-test frequency, production database size, transaction/WAL volume, **user population** (a category with direct bearing here, since production has moved from zero users to having its first real administrator), operational criticality, incident/recovery expectations, and cost constraints. No numeric threshold is defined by the SDD, ADR-022, or this ADR — inventing one now would repeat exactly the unauthorized-product-decision pattern ADR-022's own governance review already rejected once (its "Decision authority" section). Whether the population growth implied by onboarding real staff/student/parent users is itself sufficient to trigger a re-review is a Product Owner judgment call, not a technical one this ADR makes on their behalf.

## Recovery Objectives

| | Current state | Future state (unchanged from ADR-022) |
|---|---|---|
| Managed point-in-time recovery | **NOT AVAILABLE** | PLANNED — required when the scale-up trigger is reached |
| RPO | **Unbounded** (no scheduled backup of any kind exists) | 1 hour (ADR-022, approved target, still not operationally verified even once implemented) |
| RTO | **Undefined** | 1–4 hours (ADR-022, approved target, still not operationally verified even once implemented) |
| PITR retention | N/A | 7 days (ADR-022, approved target) |

No new numeric value is introduced by this ADR. Every future-state figure above is carried unchanged from ADR-022.

## Production Safety Boundary (unaffected — restated for clarity, not redecided here)

This ADR is strictly a data-recoverability governance decision. It does not authorize, and must not be read as authorizing, any relaxation of:

- Forward-only migration discipline — unchanged, no destructive migration is authorized by this ADR.
- Controlled, reviewed production deployment (F-QG06-11's `deploy-production.yml` — `main`-only, structurally protected) — unchanged.
- Row-Level Security on every production table — unchanged, remains enabled.
- Authentication (Supabase Auth password sign-in), native TOTP MFA, AAL2 enforcement — unchanged.
- RBAC, hostel scoping, and backend authorization — unchanged.
- Audit logging — unchanged.
- Access restrictions on production credentials and infrastructure — unchanged.
- The standing prohibition on ad hoc, unreviewed production database experimentation — unchanged; this ADR does not create new latitude for direct production database manipulation of any kind.

## SDD Relationship

The SDD (Ch.12 §12.7, Ch.16 §16.7) is a controlled requirement document and is **not edited by this ADR** — per `docs/implementation-baseline.md`'s source-of-truth hierarchy, an ADR may resolve an SDD ambiguity or record a governed exception to an SDD requirement, but "the SDD itself is not modified unless explicitly authorized by the project workflow" (`docs/adr/README.md`, "Relationship to the SDD"). No such formal SDD amendment process has been invoked here, and none is invoked by this ADR.

What this ADR does instead, using exactly the mechanism `docs/adr/README.md` provides for exactly this situation: it records, as an accepted architectural decision, that DigiHostel is knowingly and temporarily operating outside the SDD's stated PITR requirement, with the deviation owned by the authority ADR-022 already established (the Product Owner), time-bounded by a defined (if qualitative) revisit trigger, and with the underlying SDD requirement itself left completely intact for whenever Option E is adopted. This is the same shape of relationship ADR-025 already established between itself and ADR-016 (narrowing an already-accepted decision's applicable scope without touching the SDD or claiming the original decision was wrong) — applied here to a requirement gap rather than an authority-model clause, but the same governance mechanism.

**If a future, more formal SDD amendment process is ever established in this repository, this ADR's deviation should be reconciled against it at that time.** No such process exists today (verified: `docs/adr/README.md`'s "Relationship to the SDD" section names only ADR-mediated resolution, not a separate SDD-amendment procedure).

## Decision Authority and Acceptance Record

ADR-022 itself already closed the general question of who may make DigiHostel's RPO/RTO/PITR decisions: "the Product Owner is the authority for DigiHostel's RPO/RTO/PITR product decisions" (established 2026-09-08, by the Product Owner's own direct instruction, recorded in ADR-022's "Decision authority" section). This ADR's subject matter — whether and when to adopt the PITR/backup capability that authority already governs — falls squarely within that already-established scope. It is not a new, separately-unaddressed governance gap requiring a fresh authority determination.

**Acceptance record**: the decision "we will not be upgrading to Pro for now" was supplied via direct instruction in the same working session that has, across this entire QG-06 remediation arc, been the source of every other product/business/billing decision this project's governance has required (including, earlier in this same arc, decisions on Render infrastructure provisioning, Supabase project creation, and explicit confirmation that PITR/Pro billing decisions specifically would be "handled by the owner"). This ADR treats that as sufficient acceptance under the exact same standard ADR-022 itself was accepted on: "this repository's own ADR governance... defines no separate formal acceptance ceremony beyond obtaining and recording the decision" (ADR-022 §Status, citing `docs/adr/README.md`'s Implementation Rule step 7). No stricter standard is invented here that ADR-022 did not itself have to meet.

## QG-06 Finding Status

**F-QG06-01 is NOT closed by this ADR.** Its correct status, using this repository's evidence-tier vocabulary (VERIFIED / INFERRED / UNVERIFIED / REQUIRES DECISION / BLOCKED, and the certification-specific CLOSED / OPEN language used throughout the QG-06 series), is:

> **F-QG06-01 — TECHNICALLY UNRESOLVED — RISK ACCEPTED / DEFERRED.**

The underlying technical condition (`pitr_enabled: false`, `backups: []`) is unchanged and remains CRITICAL by objective measure. What this ADR changes is that the condition is now a **governed, explicitly-accepted** state rather than an unaddressed gap — the distinction the independent QG-06 certification explicitly asked to be preserved, not collapsed.

**This ADR does not certify production for go-live.** It does not retroactively alter any prior QG-06 evidence, does not claim PITR exists, and does not itself constitute the go-live decision. That determination remains the responsibility of the independent QG-06 review board, per this repository's own established process, using this ADR as one input among the full evidence record.

## Options Considered

- **Formalize the risk acceptance via a new ADR (selected)** — the only option consistent with `docs/adr/README.md`'s explicit rule that an accepted ADR's decision cannot be silently overridden and that a contradicting decision requires a new, properly-superseding ADR.
- **Leave the verbal decision undocumented** — rejected: this is precisely the state the independent QG-06 review flagged as insufficient; an undocumented deviation from an accepted ADR is indistinguishable, to a future reader, from an oversight.
- **Edit ADR-022 in place to remove its PITR requirement** — rejected outright: directly violates this repository's ADR immutability rule (`docs/adr/README.md`: accepted ADRs' Decision/Context/Consequences "MUST NOT be rewritten to change historical meaning").
- **Silently edit the SDD to remove the PITR requirement** — rejected outright: the SDD is a controlled document; `docs/adr/README.md` explicitly forbids resolving an SDD conflict by editing the SDD without an explicit, separate authorization this repository's workflow does not currently provide.

## Consequences

- F-QG06-01 remains open in the QG-06 findings record, now with a precise, governed status (see "QG-06 Finding Status" above) rather than an ambiguous one.
- A future scale-up review (trigger reused from ADR-022, unredefined) must explicitly reconsider this deferral, not merely the numeric RPO/RTO/retention values.
- Should a destructive, unrecoverable production data-loss event occur before Option E is adopted, this ADR is the governance record that the risk was known and accepted at the time, by the identified authority — it does not reduce the impact of such an event, only documents that it was not an unknown risk.
- No code, schema, migration, RLS policy, infrastructure configuration, or security control changes as a result of this ADR.

## Security Impact

None. This ADR does not touch, weaken, or reinterpret authentication, MFA, AAL2, RBAC, RLS, hostel isolation, audit, Force Sign-Out, or production deployment controls — all independently verified intact and unaffected, most recently and directly during the F-QG06-09 remediation this same QG-06 arc completed.

## Data/Privacy Impact

Unchanged in mechanism from ADR-022's own analysis — this ADR does not change what data exists or how it's protected in transit/at rest; it documents that a recovery copy of that data does not currently exist. The DPDP-relevant data-protection obligations ADR-022 already noted apply identically to the live database regardless of whether a backup of it exists.

## Deployment Impact

None. No deployment mechanism, workflow, or infrastructure target changes as a result of this ADR.

## Migration Impact

None for currently-running systems. This ADR does not require, authorize, or perform any database migration.

## Rollback

Trivially reversible in the direction that matters: adopting Option E (enabling PITR/backups) at any time supersedes this ADR's deferral without requiring a further governance step beyond the Product Owner's own purchase decision — this ADR does not need to be formally superseded again merely to *close* the deferral, since closing it means the underlying ADR-022 target has finally been reached, which was always the intended end state. This ADR would need formal reconsideration only if the project wished to reject Option E as a future target entirely, which is not what this decision does.

## Addendum: SDD Formally Amended (2026-09-24)

**This addendum is a factual update only. It does not change the Decision, Risk, Mitigations, Future Migration Plan, Recovery Objectives, or any other section above — all unchanged.**

This ADR's own "SDD Relationship" section, as originally written, stated that "no such formal SDD amendment process has been invoked here, and none is invoked by this ADR," and separately noted the deviation "should be reconciled against [a formal amendment process] at that time" if one were ever established.

**Update**: the Product Owner has since explicitly authorized, and this repository's implementation has performed, a direct, formal amendment to the SDD itself — not merely an ADR-level deviation. Sections 12.7 (`sdd/Chapter_12_Database_Design_and_Data_Model_SDD.docx`), 16.7 (`sdd/Chapter_16_Operations_Maintenance_and_Support_SDD.docx`), and 20.4 (`sdd/Chapter_20_Conclusion_Appendices_and_Production_Readiness_SDD.docx`) each now carry a new, clearly-labeled interim subsection/note (§12.7.1, §16.7.1, and an unnumbered note following §20.4's checklist, respectively) stating the Free-tier interim posture, its risks, and the scale-up commitment — appended immediately after each section's original, unedited requirement text, never replacing or rewording it. The original unconditional requirement language remains fully intact and readable in all three chapters; the amendment adds an explicit, scoped, time-bounded exception rather than removing the requirement.

This closes the gap this ADR itself named as unresolved. Reconciliation is complete: the SDD's own text, not only this repository's ADR layer, now explicitly accommodates the interim Free-tier posture this ADR governs.

**This does not change F-QG06-01's technical status** (still `pitr_enabled: false`, `backups: []`) and does not itself constitute a go-live certification — that determination remains the independent QG-06 board's, now informed by the fact that the SDD requirement this finding traces back to has itself been formally, explicitly scoped to accommodate the current interim state.
