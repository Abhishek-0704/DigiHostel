# ADR-022: Production Backup & Disaster Recovery Strategy

- **ADR ID:** ADR-022
- **Title:** Production Backup & Disaster Recovery Strategy
- **Status:** **ACCEPTED (2026-09-08)** — see "Product Owner Decision" below. This repository's own ADR governance (`docs/adr/README.md`) defines no separate formal acceptance ceremony beyond obtaining and recording the decision ("Implementation Rule" step 7: "Obtain/record the architectural decision"), and every other ACCEPTED ADR in this repository (ADR-016 through ADR-021) was accepted on exactly that basis — the decision being made and recorded, with no additional sign-off step. The blocking prerequisite the 2026-09-07 governance review identified (a genuine numeric RPO/RTO/PITR-retention decision from an authorized product/business party) has now been explicitly supplied via direct instruction from the Product Owner. **Acceptance of this ADR is a decision-authority/architecture-design milestone only — it does NOT mean the described architecture is implemented; no production infrastructure, PITR configuration, or backup automation has been created. See "Not Yet Implemented" below.**
- **Date:** 2026-09-07 (proposed); **Decision recorded and accepted: 2026-09-08**
- **Related ADRs:** ADR-006 (Data Platform — Supabase managed Postgres/Realtime/Storage, unaffected, this ADR operates entirely within that choice), ADR-013 (Deployment Architecture — Supabase clause unaffected), ADR-021 (API + pg-boss Worker Runtime Hosting — unaffected; explicitly notes DR posture is independent of where the API process runs).

## Correction note (2026-09-07)

This ADR's original text (same-day, earlier revision) recommended Option D
(Hybrid, without PITR) as the target production architecture and described
PITR as "gated on a product-supplied numeric RPO target — not adopted by
default." An independent review correctly identified this as inconsistent
with the SDD's own wording: the SDD names PITR as a required capability in
the same flat, unqualified form as daily backups, in two independent
chapters, with no conditional language anywhere. Treating PITR adoption
itself as contingent on a yet-unsupplied RPO number silently downgraded a
stated requirement to an optional enhancement. This revision corrects that:
**PITR is a required target-production capability, not an RPO-gated
option.** What genuinely remains unspecified — and is not invented here — is
the numeric RPO/RTO and the resulting PITR *retention window* (7/14/28
days), not whether PITR exists at all. See "Decision" and "Options
Considered" below for the corrected architecture. The original Option A–D
analysis is preserved below (this repository's general practice of not
deleting analytical value) with a new Option E added and the recommendation
revised to point at it.

## Context

F-04 (PRR Phase 13, re-verified 2026-09-07) established, with direct evidence
rather than assumption, that the current DigiHostel staging Supabase project
(`lhonrqjmlhlehpbxvrag`) has **zero backup coverage of any kind**:

```json
{"region":"ap-south-1","walg_enabled":true,"pitr_enabled":false,"backups":[],"physical_backup_data":{}}
```

No production Supabase project exists yet.

**SDD requirement, verified directly against the source documents (not
inferred), 2026-09-07:**

| Requirement | Exact SDD wording | Interpretation |
|---|---|---|
| PITR (database) | Ch.12 §12.7: *"Automated daily backups, point-in-time recovery, periodic restore testing, and archival of historical audit data."* | **Mandatory** — listed as a flat, undifferentiated capability alongside daily backups, with no hedging ("should"/"optional"/"where needed") |
| PITR (operations) | Ch.16 §16.7: *"Daily backups, PITR, restore drills, documented runbooks."* | **Mandatory** — independently repeated in a second chapter (Operations, distinct from Database Design), reinforcing rather than narrowing Ch.12 |
| Backups (deployment) | Ch.14 §14.8: *"Use automated Supabase backups, periodic recovery testing, infrastructure documentation, and rollback procedures for failed deployments."* | Confirms automated backups as a deployment-chapter requirement; does not itself name PITR, but does not narrow or contradict Ch.12/Ch.16's PITR requirement either |
| Backups (go-live gate) | Ch.20 §20.4 Production Readiness Checklist: *"Backups configured"* | Backup configuration (which, per Ch.12/Ch.16, includes PITR) is a named go-live gate item |
| Numeric RPO/RTO/retention | Not found anywhere in the SDD | `NOT SPECIFIED` — confirmed via a targeted keyword search (RPO, RTO, retention, business continuity, availability, SLA, uptime) across Chapters 12, 14, 16, 17, and 20; no numeric target exists anywhere |
| Numeric uptime (found this task, not previously) | Ch.18 (Future Roadmap, Scalability and Advanced Features): *"KPIs: 100k+ users, <500ms API, 99.9% uptime, <2s realtime latency."* — verified directly against the source document, not inferred | **Not an RPO/RTO decision.** This figure is stated inside a "Future Roadmap"/"Multi-Tenant Design" cluster explicitly scoped to a 100k+-user future scale — a scale this repository's own governance consistently describes the current system as *not yet* being (ADR-011: "MVP/pilot-hostel scale, not high-frequency job volume"). Even setting the scale question aside, an aggregate uptime SLA (allowed total downtime across all causes — deploys, bugs, disasters, maintenance) is a different metric from a disaster-recovery RTO (time to recover from one specific incident) or RPO (acceptable data loss in one specific incident); 99.9% uptime does not mathematically imply a single-incident RTO/RPO value without additional assumptions (disaster frequency, other downtime sources' share of the budget) the SDD does not supply. **Recorded as found, not used to resolve the RPO/RTO gap.** |

**Conclusion**: the SDD specifies PITR as a **mandatory architectural
capability** for production, stated identically and independently in two
chapters, with no qualifying or conditional language and no later chapter
that narrows or exempts it. It does **not** state that PITR adoption is
conditional on a numeric RPO — it simply requires PITR to exist. Separately,
and consistent with the earlier F-04 findings, **no numeric RPO, RTO, or
PITR retention period is specified anywhere** — this is a genuine, unfilled
requirement gap (`docs/adr/README.md`'s source-of-truth hierarchy), but it
is a gap in *retention sizing*, not in *whether PITR is required at all*.
The SDD does not itself state that RPO determines PITR retention sizing —
that is a standard, reasonable operational inference (a retention window is
inherently sized in days, and RPO is what determines how many days of
recoverability are actually needed) rather than an SDD-stated rule; it is
presented as such below, not as an SDD requirement, to avoid overclaiming.

DigiHostel's own manual logical-backup capability
(`supabase/scripts/backup.mjs`) has been built and verified end-to-end
(schema/data restore, genuine actor-level RLS testing) but has no scheduler,
no off-site upload, no retention policy, and no automated verification —
"existing manual backup capability ≠ production backup automation."

This ADR exists because the *specific backup/PITR strategy* DigiHostel adopts
before production launch is a genuine, cross-cutting architectural decision
with real cost, security, and data-durability consequences — not merely an
operational runbook detail — and no accepted ADR currently makes it. ADR-006
selected Supabase as the data platform and named "Regular backups" as part of
its security rationale, but never selected a specific backup/PITR tier or
strategy.

## Decision

**ACCEPTED (2026-09-08).** This ADR distinguishes two explicitly different
postures (corrected 2026-09-07 from the original single-recommendation
form), now finalized with the approved product decision below.

### Product Owner Decision (2026-09-08)

The following were explicitly supplied by the Product Owner, via direct
instruction, closing the governance gap the 2026-09-07 decision-authority
review identified (see "Decision authority" below for the full before/after
distinction):

| Requirement | Approved value | Status |
|---|---|---|
| Decision authority | **Product Owner** | Established for this milestone by explicit Product Owner instruction — not previously defined by this repository's own governance documents (see "Decision authority" below) |
| RPO | **1 hour** | Approved architecture *target* — **not yet operationally verified**. This is a requirement the production DR architecture must be built to satisfy, not a demonstrated capability. |
| RTO | **1–4 hours** (a range, not a single value) | Approved architecture *target* — **not yet operationally demonstrated**. Must not be collapsed to "1 hour" or "4 hours"; the approved requirement is the full range. |
| PITR retention | **7 days** | Approved product decision. Not selected by this ADR on technical/cost grounds (see "PITR Retention Tier Analysis" below, preserved for its comparative analysis, not as the basis for this choice) — chosen by the Product Owner. |
| Scale-up review trigger | DR requirements (RPO, RTO, PITR retention, backup frequency, restore-test frequency, database size, transaction/WAL volume, user population, operational criticality, incident/recovery expectations, cost constraints) must be revisited **when DigiHostel materially scales or its operational/data-criticality requirements change** | Qualitative trigger — no numeric threshold (e.g. a specific user count or database size) is defined by the SDD or this decision, and none is invented here |

**Architecture requirement ≠ operational verification, throughout this ADR.**
Approving these targets records what the production DR architecture must be
built to achieve; it does not mean the system has been measured against
them. RPO=1 hour and RTO=1–4 hours have **not** been demonstrated through
any restore drill, staging test, or production measurement — the local
~2-second schema restore observed in earlier F-04 testing
(`docs/runbooks/disaster-recovery.md` §7.2) is explicitly **not** evidence
of this RTO, since it used a bare local database at seed scale, not a
managed PITR restore at production data/WAL volume. Supabase's own
documentation notes PITR restore duration varies with WAL activity and
database size — the approved 1–4 hour RTO must eventually be demonstrated
through an actual restore drill against a production-representative
target, not inferred from any test performed so far.

### Interim staging DR posture (today, non-production)

The current staging project (`lhonrqjmlhlehpbxvrag`) remains on the Free
plan — `pitr_enabled: false`, zero managed backups. This is an **accepted,
explicit, non-production limitation**, not a claim of SDD compliance:
staging is not the environment the SDD's backup/PITR requirement governs
(no user-facing production traffic depends on it), and no budget decision
has authorized upgrading a pre-launch staging environment to Pro. Because
staging is on Free, it cannot have the managed-backup or PITR halves of
Option D/E at all — the only mitigating practice actually available today
is Option C (manual logical backup via `supabase/scripts/backup.mjs`,
currently unscheduled). This is adequate for a staging environment used for
verification and demonstration, and explicitly **not** claimed adequate for
production.

### Target production DR architecture (required for SDD compliance)

**Option E — Hybrid + PITR**: Supabase **Pro-tier managed daily backups**
+ **PITR enabled at a 7-day retention window (Product Owner decision,
2026-09-08)** (both the managed-backups/PITR requirement and the specific
retention choice are now settled — required by the SDD unconditionally,
Ch.12 §12.7/Ch.16 §16.7, with the retention tier itself a Product Owner
decision, not a technical inference) + continued, scheduled use of the
independent logical-backup script (`supabase/scripts/backup.mjs`) for an
off-platform, portable copy, defense-in-depth against a platform-level
incident, and independent restore verification.

This decision requires prerequisites this ADR does not itself authorize or
perform: (1) a production Supabase project must exist, and (2) whoever owns
the production budget must approve the recurring Pro + PITR cost (§Cost
below) — **neither has happened yet**. **This ADR does not enable anything,
upgrade any plan, or create any production resource** — acceptance of this
ADR is a design/decision-authority milestone, not an implementation action.

### Scale-up review trigger (Product Owner decision, 2026-09-08)

The approved RPO (1 hour), RTO (1–4 hours), and PITR retention (7 days)
above are not permanent, one-time-only values. The Product Owner has
explicitly required that **these DR requirements be revisited when
DigiHostel materially scales or its operational/data-criticality
requirements change** — a qualitative trigger, not a numeric threshold (no
specific user count, database size, or request volume is defined by the
SDD or this decision, and none is invented here). At minimum, a future
review under this trigger must reconsider: RPO, RTO, PITR retention, backup
frequency, restore-test frequency, production database size,
transaction/WAL volume, user population, operational criticality,
incident/recovery expectations, and cost constraints.

## Options Considered

### Option A — Supabase Pro managed daily backups only

- **Coverage**: Automated daily backups, retained on a rolling window (per
  Supabase's Pro-tier default — see Cost section for what could and could not
  be verified this session).
- **Operational simplicity**: Highest of the paid options — no scripts to
  maintain, restore is dashboard-driven.
- **Restore process**: Supabase-managed "restore to new project" or in-place
  restore from the dashboard; not self-service outside Supabase's own tooling.
- **Downtime during restore**: Not measured this task (no live drill
  performed, per this task's explicit no-mutation instruction); Supabase's
  own documentation should be consulted at drill time, not assumed.
- **Cost**: Pro-tier base subscription (see §Cost) — no separate backup
  add-on charge; daily backups are included in Pro.
- **Suitability for DigiHostel**: Directly satisfies the SDD's "automated
  daily backups" requirement (Ch.12 §12.7, Ch.16 §16.7) with the least
  operational effort. Does not, by itself, provide an off-platform copy —
  a Supabase account-level incident (billing lockout, account compromise,
  accidental project deletion) still risks losing both the live database and
  its only backups together, since both live inside the same platform
  account.

### Option B — Pro + PITR

- **Recovery granularity**: Arbitrary point-in-time within the purchased
  retention window (7/14/28 days), materially better than "most recent daily
  snapshot" for a bad `UPDATE`/`DELETE` discovered hours after the fact.
- **Retention**: Directly verified this session via this project's own
  Management API billing-addons catalog (`GET /v1/projects/{ref}/billing/addons`,
  2026-09-07) — **7 days: $100/month, 14 days: $200/month, 28 days:
  $400/month**, on top of the Pro base subscription. This is real,
  project-specific pricing evidence (E1), not a generic published number.
- **Operational complexity**: Low once enabled — PITR restore is also
  dashboard-driven.
- **Compute requirement**: Supabase's own documentation states PITR requires
  a compute add-on above the smallest tier for reliable WAL retention at
  scale; the exact minimum tier was **not independently re-verified this
  session** (the addon catalog lists compute tiers and PITR as separate line
  items with no explicit cross-dependency field returned) — must be
  confirmed against current Supabase documentation at purchase time, not
  assumed from this ADR.
- **Suitability for DigiHostel today**: The marginal cost over Option A/D
  ($100–400/month) is only justified by a genuine sub-24-hour RPO
  requirement, which no SDD/ADR text currently states. Recommended as a
  **future upgrade**, not the initial production posture.

### Option C — Free + external logical backups only (today's actual state)

- **Coverage**: Whatever an operator manually chooses to run via
  `supabase/scripts/backup.mjs`; **today, nothing is scheduled at all** —
  the true current RPO is unbounded (§RPO below).
- **Off-site storage, encryption, retention, verification**: None of these
  exist today (§9 of the design analysis below) — this option, as currently
  implemented, is a *capability*, not an operational *practice*.
- **Cost**: $0 platform cost.
- **Restoration process**: Fully self-service (`psql -f schema.sql; psql -f
  data.sql`), verified working this session and in the prior F-04 test, but
  restores into a bare (non-Supabase-provisioned) target lose exactly 10
  named `auth.uid()`-direct RLS policies, the `supabase_realtime`
  publication, and the migration-history table (`docs/runbooks/disaster-recovery.md`
  §6.4/§9) unless the target is itself a genuine Supabase-provisioned
  project.
- **Credential/security requirements**: Already minimal and verified safe —
  the script embeds no credentials (§20/§14 of the runbook).
- **Operational burden**: Entirely manual, unscheduled, no alerting on
  failure, no retention cleanup, no off-site copy — the highest ongoing
  human burden of any option, and the only one where a missed manual run
  means zero backup coverage for that period.
- **Suitability for DigiHostel production**: **Not sufficient alone** for a
  production system holding parent/student PII and security-incident
  geolocation data — no scheduling, no off-site durability, no
  independent verification loop.

### Option D — Hybrid: Pro managed backups + independent logical backups, without PITR (INTERIM/NON-COMPLIANT — see correction note)

- Combines Option A's low-effort, platform-managed daily coverage with
  Option C's capability as a genuinely independent, off-platform, portable
  copy — protecting against two different failure classes at once: ordinary
  data-loss incidents (bad migration, accidental delete) recoverable via
  Supabase's own daily backup, **and** platform-level incidents (account
  lockout, billing dispute, accidental project deletion, a Supabase-side
  outage affecting backup infrastructure itself) recoverable only because an
  independent copy exists outside Supabase's own control plane.
- **Cost**: Pro base subscription only — the logical-backup half re-uses
  `supabase/scripts/backup.mjs`, already built, at $0 marginal platform cost
  (excluding wherever the operator chooses to store the resulting files
  durably, which is an infrastructure decision this ADR does not make — see
  §9 of the runbook's off-site-backup design).
- **Operational complexity**: Moderate — still requires someone to actually
  schedule and monitor the logical-backup half (§Backup Automation Design,
  `docs/runbooks/disaster-recovery.md` §19); the managed half needs no
  ongoing operator action.
- **Suitability for DigiHostel**: **Corrected assessment (see correction
  note at the top of this ADR): this option, by itself, does NOT satisfy the
  SDD's PITR requirement** and must not be described as the final,
  SDD-compliant production architecture. It remains genuinely useful as (a)
  the honest description of what staging can offer today given its Free
  plan, and (b) the non-PITR *half* of Option E below, which layers PITR on
  top of exactly this same Hybrid foundation. It is not, on its own,
  presented as a production recommendation by this (corrected) revision.

### Option E — Hybrid + PITR (TARGET PRODUCTION ARCHITECTURE, RECOMMENDED)

- Everything in Option D (Pro-tier managed daily backups + independent,
  scheduled logical backups for off-platform portability and defense against
  a platform-level incident) **plus PITR enabled**, satisfying the SDD's
  Ch.12 §12.7/Ch.16 §16.7 requirement in full rather than partially.
- **Cost**: Pro base subscription (E2, ~$25/month published) + PITR add-on
  at the **approved 7-day tier: $100/month** (E1, directly verified this
  project's own billing-addons API) — the 14-day ($200/month) and 28-day
  ($400/month) tiers were also evaluated (§PITR Retention Tier Analysis
  below) but not chosen; the Product Owner selected 7 days (2026-09-08).
- **Operational complexity**: Same as Option D for the logical-backup half
  (needs a scheduler, §19 of the runbook) plus PITR's own low ongoing
  operational burden once enabled (dashboard-driven, per Option B).
- **Relationship between the two mechanisms — complementary, not
  substitutes**: PITR (continuous, platform-internal, arbitrary point-in-time,
  no off-platform artifact) and the independent logical backup (discrete,
  operator-controlled, downloadable, portable, verifiable outside Supabase's
  own infrastructure) protect against different failure classes. Supabase's
  own current documentation confirms `supabase db dump` (the mechanism
  `backup.mjs` wraps) remains available and useful even when physical
  backups/PITR are also active — this ADR does not treat either mechanism as
  redundant with the other.
- **Suitability for DigiHostel**: This is the architecture required for SDD
  compliance, and — with the Product Owner's 2026-09-08 decision — every
  parameter needed to provision it is now settled (RPO 1 hour, RTO 1–4
  hours, PITR retention 7 days). What remains is implementation: a
  production Supabase project must exist and its budget must be approved
  before any of this is actually provisioned (§Not Yet Implemented below).

## PITR Retention Tier Analysis (F-04 Governance Closure, 2026-09-07)

**PITR retention window ≠ RPO.** A retention window determines how far back
in time a recovery point remains *available*; RPO determines how much
*recent* data loss is acceptable in a given disaster. A longer retention
window does not, by itself, produce a tighter RPO — PITR's actual recovery
granularity (how close to the moment of disaster a recovery point can be
selected) is essentially the same across all three tiers below, since all
are continuous WAL-based; what differs is how *far back* an operator can
still reach, not how *fine-grained* recovery is. No tier below is presented
as satisfying any specific RPO, because no RPO is specified to satisfy.

| Tier | Capability | Cost (E1, this project's own billing-addons API) | Operational implication | Recovery-window implication |
|---|---|---|---|---|
| 7-day | Continuous point-in-time recovery to any moment within the last 7 days | $100/month | Lowest cost of the three; least margin for a disaster discovered late (e.g. a subtle data-corruption bug noticed 9 days after introduction would already be outside this window) | Recovery points available up to 7 days back only — anything older falls back to the daily-backup or logical-backup mechanisms (if those separately retain that far back) |
| 14-day | Same continuous recovery granularity, extended lookback | $200/month | Doubles the cost of the 7-day tier; better margin for slower-to-discover incidents | Recovery points available up to 14 days back |
| 28-day | Same continuous recovery granularity, longest lookback | $400/month | Highest cost of the three; largest margin for late-discovered incidents (e.g. an issue found near the end of a monthly reporting/audit cycle) | Recovery points available up to 28 days back |

**No tier was recommended by this ADR on technical or cost grounds** —
selecting one required a product/business decision about (a) the acceptable
RPO (PITR can satisfy essentially the same fine recovery granularity
regardless of tier; the tier choice is really about *how late a disaster
can be discovered and still be recoverable*, not about how much data is
lost within a single incident) and (b) how much budget to allocate to that
margin. **This table intentionally did not select the cheapest tier merely
because it was cheapest.**

**Resolved (Product Owner decision, 2026-09-08): 7-day retention, $100/month.**
The 7-day tier happens to be the least expensive of the three, but it was
not chosen by this ADR for that reason — it reflects the Product Owner's
own RPO (1 hour) and cost judgment, supplied directly, not a
cost-minimizing default inserted by this ADR. The 14-day and 28-day figures
above remain documented for the "Scale-up review trigger" — if DigiHostel's
operational criticality or incident-discovery-latency profile changes
materially, this table's comparison is what a future review would revisit
retention against.

## Decision Criteria Ranking

| Criterion | A — Pro backups | B — Pro + PITR | C — Free + manual logical | D — Hybrid (no PITR) | E — Hybrid + PITR |
|---|---|---|---|---|---|
| Meets SDD's "automated daily backups" text | Yes | Yes | No (manual, unscheduled) | Yes | Yes |
| Meets SDD's "point-in-time recovery" text | No | Yes | No | **No** | **Yes** |
| Fully SDD-compliant for production | No | Partial (no off-platform copy) | No | **No** | **Yes** |
| Off-platform/independent copy | No | No | Yes (capability only, not practice) | Yes | Yes |
| Cost (recurring) | Pro base only | Pro base + $100–400/mo | $0 | Pro base only | Pro base + $100–400/mo |
| Operational burden | Lowest | Low | Highest | Moderate | Moderate |
| Protects against platform-level incident | No | No | Yes | Yes | Yes |
| Requires product RPO decision | No | Yes (retention window) | N/A | No | **Resolved 2026-09-08** — RPO 1h, RTO 1–4h, retention 7d (Product Owner) |
| Migration effort from today | Low (plan upgrade only) | Low (plan + addon) | None (already exists) | Low (plan upgrade; logical half already built) | Low (plan + addon; logical half already built) |

## Cost

| Option | Supabase plan/add-on | Required compute | Backup capability | PITR | Known recurring cost | Unknown cost |
|---|---|---|---|---|---|---|
| A | Pro | Whatever compute tier the project already runs (Free-tier shared compute today) | Daily, included in Pro | No | Pro base subscription — **published on Supabase's own pricing page as $25/month per project**; **not independently re-verified via this session's Management API access** (org-level billing endpoints returned 403/empty for this task's PAT scope — E2, documentation-sourced, not E1) | Whether a larger compute tier is required for production load (separate from backup strategy) |
| B | Pro + PITR add-on | Possibly a larger compute tier than Micro (Supabase docs suggest this; not independently confirmed this session) | Daily, included in Pro | Yes | Pro base ($25/mo, E2) + PITR add-on — **verified live this session via this project's own billing-addons API, E1**: 7 days $100/mo, 14 days $200/mo, 28 days $400/mo | Exact compute-tier gate for PITR eligibility |
| C | Free (current) | Free-tier shared compute (current) | None (manual only) | No | $0 | Off-site storage cost, if/when implemented (not selected by this ADR) |
| D | Pro | Whatever compute tier the project already runs | Daily (Pro) + manual logical (unscheduled today) | No — **not SDD-compliant alone, see correction note** | Pro base ($25/mo, E2) | Same off-site-storage question as C for the logical-backup half |
| E | Pro + PITR add-on (**7-day tier, Product Owner-approved**) | Possibly a larger compute tier than Micro (same caveat as B) | Daily (Pro) + manual logical (needs scheduling, §19) | **Yes — target production architecture, 7-day retention** | Pro base ($25/mo, E2) + PITR add-on **$100/month for the approved 7-day tier** (E1) | Same compute-tier and off-site-storage questions as B/D — retention itself is now resolved |

No purchase was made and no plan was changed by this ADR or by the task that
produced it. The $25/month Pro-base figure is carried from Supabase's public
pricing page (general knowledge / documentation, E2) because this session's
Management API access could not reach an org-level billing/subscription
endpoint (`/v1/organizations` returned `[]`, `/v1/organizations/{id}`
returned `403`, `/v1/projects/{ref}/billing/subscription` returned `404`) —
this gap is recorded honestly rather than papered over with an invented
number, and should be re-verified against Supabase's current pricing page or
an org-owner's dashboard access before any purchase decision is finalized.

## Rationale

**Corrected (see correction note)**: Option E is recommended as the target
production architecture because it is the only option that both satisfies
the SDD's explicit, unqualified PITR requirement (Ch.12 §12.7/Ch.16 §16.7)
and addresses the platform-level-incident failure class the original
Option-D-only analysis correctly identified (backup and live data both
inside one Supabase account, if PITR/daily-backups were the only mechanism).
Option A alone fails the platform-incident case. Option B alone fails the
off-platform-copy case. Option C alone (today's actual state) does not meet
"automated daily backups" at all, since nothing is currently scheduled, and
does not meet the PITR requirement either. Option D alone — the original
recommendation — satisfies the off-platform-copy case but **fails the PITR
requirement**, which is why it is no longer presented as the production
target; it remains an accurate, honest description of what is available
during the interim staging period.

What was genuinely **not** invented by this ADR's own technical analysis:
the numeric RPO/RTO and the resulting PITR retention window — those came
from the Product Owner directly (2026-09-08), not from this ADR's
cost/capability comparison. Recommending Option E never required knowing
that number — Option E's technical recommendation was "enable PITR," which
the SDD states unconditionally; *which* retention tier to purchase was
always the part that waited on a product decision, and now has one.

## Alternatives Considered

See the five options above. No alternative outside Supabase's own managed
backup/PITR/logical-dump primitives was evaluated, since ADR-006 already
selected Supabase as the data platform and re-litigating that choice is out
of this ADR's scope. Options A, B, C, and D are retained as genuine
alternatives/building blocks (D is E without PITR; B is E without the
independent logical-backup half) rather than deleted, since each documents
a real, distinct tradeoff.

## Consequences

- **Now that this ADR is accepted**: whoever owns the future production
  Supabase project budget must still approve a recurring Pro + PITR (7-day)
  subscription before go-live — that approval has **not** happened yet, and
  is a separate, later step from this ADR's acceptance; the existing
  `backup.mjs` script still needs a real scheduler (cron/CI/hosted job) and
  off-site storage destination designed and implemented as a follow-up,
  narrowly-scoped task (§19 of the runbook) — not created by this ADR.
- **Corrected (2026-09-07)**: PITR is **not** an optional future upgrade
  contingent on RPO — it is part of the target architecture itself.
- **Resolved (2026-09-08)**: RPO (1 hour), RTO (1–4 hours), and PITR
  retention (7 days) are now Product Owner-approved targets — architecture
  requirements, not yet operationally verified capabilities. A scale-up
  review trigger (qualitative) requires revisiting all of these when
  DigiHostel materially scales or its operational criticality changes.
- No code, schema, migration, or RLS change results from this ADR.
- No existing ADR is superseded — this is a new decision in a previously
  unaddressed area (ADR-006 named "regular backups" as a security property
  but never selected a specific strategy).

## Not Yet Implemented (production readiness — explicit, not implied)

Acceptance of this ADR is a decision-authority/architecture-design
milestone. None of the following has been done, and this ADR does not
authorize doing them:

- No production Supabase project exists.
- PITR has not been enabled on any project (staging remains
  `pitr_enabled: false`, per §Context).
- No production PITR configuration (7-day retention) has been purchased or
  configured.
- No production backup scheduler exists for the independent logical-backup
  half.
- No off-site backup storage destination has been created.
- No production restore drill has been performed.
- No production application smoke test after a restore has been performed.
- The approved RPO (1 hour) and RTO (1–4 hours) have not been operationally
  demonstrated by any test performed so far.

## Security Impact

Selecting Option E does not, by itself, change any trust boundary — it
determines *where* durable copies of the database exist and how quickly a
specific point-in-time can be recovered, not who can access the live one.
The independent logical-backup half must continue to follow the security
posture already verified in F-04 (no embedded credentials, git-ignored
output, isolated restore targets) — see `docs/runbooks/disaster-recovery.md`
§14 for the security checklist that must continue to hold whenever this
half is actually scheduled. PITR itself is a Supabase-platform-internal
mechanism; enabling it introduces no new credential or trust boundary this
repository's own code must handle.

## Data/Privacy Impact

Both halves of Option E copy the same PII a live restore would (parent/student
records, leave-request content, security-incident geolocation); PITR's
continuous WAL archiving does too, entirely within Supabase's own
infrastructure. Wherever the logical-backup half's output is eventually
stored durably (§9 of the runbook design), that location inherits the same
DPDP-relevant data-protection obligations as the live database
(`docs/security.md`'s Privacy by Design principle) — a decision this ADR
does not make (see the runbook's explicit open decision on off-site storage
provider).

## Cost/Operational Impact

See §Cost above. Operationally, Option E requires one new, currently
nonexistent piece of infrastructure (a scheduler for the logical-backup
half) before it delivers its full intended coverage — until that exists,
the logical half remains as manual and unscheduled as it is today, while
the Pro + PITR half (once purchased) needs no comparable ongoing operator
action.

## Migration Impact

None for currently-running systems — no production project exists yet to
migrate. Adopting this ADR at production-provisioning time means starting
directly on Pro + PITR rather than starting on Free and upgrading later,
avoiding a window of SDD-non-compliant backup coverage in production
(unlike staging's current, accepted, non-production gap).

## Rollback

Trivially reversible — this ADR selects a subscription tier, an add-on, and
an operational practice, not application code or schema. Downgrading away
from Pro/PITR (or dropping the logical-backup schedule) is a plan/process
change, not a migration — though doing so post-launch would reopen the SDD
non-compliance this ADR exists to close, and should not be done without a
new governance decision.

## Historical Open Question — RESOLVED 2026-09-08 (preserved for record, not deleted)

**Resolution banner**: everything in this section describes the state of
the decision *before* 2026-09-08. It is preserved verbatim as the accurate
historical record of the governance gap and how it was reasoned about,
consistent with this repository's practice of correcting/superseding
rather than silently erasing prior analysis. **The numeric RPO/RTO/PITR-retention
values below are now resolved — see "Product Owner Decision (2026-09-08)"
under "Decision" above for the current, authoritative values (RPO 1 hour,
RTO 1–4 hours, PITR retention 7 days).** Do not treat the "still NOT
SPECIFIED"/"remains unselected" language immediately below as current.

**Numeric RPO/RTO target and PITR retention window**: as of 2026-09-07,
still `NOT SPECIFIED` by the SDD/ADRs, and **no repository source or
governance document authorized Claude to supply one** (`workflow.md`/`CLAUDE.md`
granted no such authority; every prior F-04 task in this series was
explicitly instructed not to invent RPO/RTO; ADR-020's precedent — leaving
SMS-provider selection "an explicitly open, tracked pre-production
decision" rather than choosing one — was the established pattern this ADR
followed). This was a genuine **PRODUCT DECISION REQUIRED**, not a gap this
ADR or any Claude session was to fill unilaterally — and it was not: the
resolution came from the Product Owner directly, on 2026-09-08.

**Corrected framing (still accurate)**: the missing RPO never blocked the
decision to adopt PITR itself — the SDD already required that,
unconditionally (see the SDD requirement table above). What it blocked was
selecting *which* retention tier (7/14/28 days, §PITR Retention Tier
Analysis above) to purchase. **No default or fallback tier was suggested**
— an earlier revision of this section had suggested defaulting to the
cheapest (7-day) tier as an interim measure; that suggestion was withdrawn,
since selecting any tier without a stated RPO — even provisionally, even
the cheapest one — would have been exactly the kind of unauthorized product
decision the 2026-09-07 governance review instructed against. The Product
Owner's independent 2026-09-08 choice happened to also be 7 days, but
arrived at as an actual product decision, not as this ADR's own default.

**RTO**: as of 2026-09-07, also `NOT SPECIFIED` by the SDD/ADRs. Now
approved as 1–4 hours (2026-09-08), but still **not operationally
demonstrated** — production RTO must still be established through a
future, authorized restore/recovery drill against a genuinely
production-representative target; it must not be inferred from the local,
seed-scale ~2-second schema restore observed in earlier F-04 testing
(`docs/runbooks/disaster-recovery.md` §7.2), which reflects neither
production data volume nor a managed-restore mechanism.

### Decision authority (governance review, 2026-09-07; resolved 2026-09-08)

**Before this task (2026-09-07 finding, unchanged as history)**:

A dedicated review of `CLAUDE.md`, `workflow.md`, `docs/implementation-baseline.md`,
`docs/decision-log.md`, and `docs/adr/README.md` was performed specifically
to answer: *who is authorized to decide DigiHostel's numeric RPO, numeric
RTO, and PITR retention tier?*

**Finding: PRODUCT GOVERNANCE GAP — RPO/RTO/PITR-retention decision
authority is unspecified.** None of these documents names a person, role,
or process authorized to set numeric business/operational targets like RPO
or RTO, or to select among technical options (like a PITR retention tier)
that are themselves gated on such a target:

- `CLAUDE.md` and `workflow.md` use "authorization" only in the
  application-security sense (authentication/RBAC/RLS) — never in the
  governance-decision sense of who may approve a product requirement.
- `docs/adr/README.md`'s lifecycle policy defines ADR *states*
  (PROPOSED → ACCEPTED → SUPERSEDED → ARCHIVED) and the *mechanics* of a
  supersession, but nowhere names who performs the PROPOSED → ACCEPTED
  transition — its "Implementation Rule" step 7 says only "obtain/record
  the architectural decision," in the passive voice, with no named actor.
- `docs/decision-log.md` is a template for *recording* an already-made
  decision; it defines no approval authority either.
- `docs/implementation-baseline.md`'s source-of-truth hierarchy ranks
  *artifacts* (accepted ADRs > SDD > CLAUDE.md > ...) but says nothing
  about who is authorized to produce a new accepted ADR in the first place.
- The closest existing precedent is **procedural, not an authority
  grant**: ADR-020 left SMS-provider selection "an explicitly open, tracked
  pre-production decision" without ever naming who would eventually make
  it. That pattern is followed here (leave the question open, correctly
  attributed to nobody in particular), not treated as evidence that a
  "product/business owner" role is formally established in this
  repository's governance — it is a convention for whoever eventually
  holds that authority outside this repository, not a defined role within
  it.

**This was Case C, not Case A or B**: authority was genuinely unspecified,
not merely insufficiently scoped. This gap was recorded as-is — **no
authority was assigned to Claude, to "the developer," or to any arbitrary
architecture role mentioned elsewhere in this repository.**

**After this task (2026-09-08)**: the Product Owner has explicitly
established, by direct instruction, that **the Product Owner is the
authority for DigiHostel's RPO/RTO/PITR product decisions**, and has
exercised that authority to supply the values recorded under "Product Owner
Decision (2026-09-08)" above. **This does not mean the repository's
pre-existing governance documents (`CLAUDE.md`, `workflow.md`,
`docs/adr/README.md`, `docs/decision-log.md`, `docs/implementation-baseline.md`)
are retroactively found to have already contained this authority — they did
not, and still do not textually name it.** What changed is that the
authority gap was closed by an explicit, one-time act of the Product Owner
themselves declaring and exercising that role for this specific decision,
not by discovering language that was there all along. Wherever this ADR (or
any other document in this repository) uses the phrase "product/business
owner" from this point forward, for DR-related RPO/RTO/PITR decisions
specifically, it now refers to this established authority — a genuine
governance fact as of 2026-09-08, not a reinterpretation of older text.

No repository-defined mechanism existed for *formally requesting* this
decision beyond this ADR's own "Open Question" section (this one),
following the same pattern ADR-020 and ADR-017 already established for
other open pre-production decisions — and none was needed in the end,
since the decision arrived by direct Product Owner instruction rather than
through a formal request. No new artifact or workflow was created for this
purpose, consistent with the 2026-09-07 governance review's explicit
instruction not to invent one. A corresponding entry was subsequently added
to `docs/decision-log.md`, matching the existing convention already used
for ADR-014 and ADR-020 (both ACCEPTED ADRs also received a decision-log
entry) — see that file for the condensed record.

## Addendum: Free-Tier-First Implementation Note (2026-09-08)

**This addendum adds an implementation-sequencing clarification. It does
NOT alter, reinterpret, or weaken the accepted Decision, Options
Considered, Rationale, or Consequences above** — per this repository's ADR
immutability rule, an accepted ADR's decision text is not rewritten; this
section is purely additive (an "implementation reference," one of the
immutability rule's explicitly permitted addition types).

**Clarification**: this ADR defines DigiHostel's **future production DR
target** (Hybrid + PITR at 7-day retention, RPO 1 hour, RTO 1–4 hours). It
does not, and never did, require the *current* development/testing/staging
environment to already run on Supabase Pro or have PITR enabled. The
current implementation is **intentionally Free-tier-first** — DigiHostel is
built and operated on Supabase's Free plan during this phase, per the
explicit policy recorded in `docs/runbooks/disaster-recovery.md` §23–§27
and `docs/current-state.md`. Free-tier operation is the current
implementation constraint; the architecture described in this ADR (Option
E) remains the future scale-up capability target, reached via the
already-approved qualitative scale-up trigger — not implemented today, and
this addendum does not change when or how it will be.

No numeric value in this ADR (RPO, RTO, PITR retention, the scale-up
trigger) is changed by this addendum.

## Addendum: PITR Classification Correction (2026-09-08)

**This addendum is a factual clarification only. It does not change RPO
(1 hour), RTO (1–4 hours), PITR retention (7 days), decision authority
(Product Owner), the Free-tier-first current implementation, or the
paid-scale-up-when-materially-required policy — all unchanged.**

**Clarification**: PITR is a **separate project add-on on Pro**, not part
of the $25/month Pro base subscription. This ADR's own Cost/Options
sections already correctly phrase it as "Pro base subscription... + PITR
add-on" throughout (see "Cost" and Options B/E above) — this addendum
exists only to state the classification explicitly and in one place, since
a related document (`docs/runbooks/disaster-recovery.md`) was found to
present PITR and managed daily backups side-by-side in a single "included
with Pro" table in a way that could be misread as bundling them; that
runbook table has been corrected (§27's "Included with the Pro base
subscription" vs. "Separate project add-ons" split).

**DigiHostel's future production target remains**: Pro (base subscription)
+ the 7-day PITR add-on, purchased separately, at the Product Owner's
approved retention tier.

**Pricing is not a permanent guarantee**: the $100/month figure for 7-day
PITR (E1, this project's own live Management API billing-addons query,
2026-09-07) and the $25/month Pro base figure (E2, published pricing, not
independently re-verified this session) reflect pricing at the time they
were checked. **Both must be re-verified immediately before the production
scale-up decision** — this ADR does not guarantee either figure will still
hold at that time.
