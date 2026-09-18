# Disaster Recovery Runbook — DigiHostel Database

F-04 remediation (PRR Phase 13). This is the authoritative operational
procedure for recovering the DigiHostel Postgres database from backup. It
records what is actually true today, not an aspirational target — see §8
("Last tested") for the honest current state.

## 1. Purpose

Defines what constitutes a DigiHostel database disaster, and how to recover
from one. A "database disaster" here means any event that makes the
authoritative Postgres data unavailable or untrustworthy: accidental data
deletion, a bad migration, storage/infrastructure failure, or corruption —
not an application-level bug that a code deploy can fix.

## 2. Governing requirements (SDD)

The SDD specifies, verbatim, directly from the source documents (re-verified
2026-09-07):

| Chapter | Exact wording | Interpretation |
|---|---|---|
| Ch.12 §12.7 (Database Design) | *"Automated daily backups, point-in-time recovery, periodic restore testing, and archival of historical audit data."* | **PITR mandatory** — flat, undifferentiated capability list, no hedging language |
| Ch.16 §16.7 (Operations) | *"Daily backups, PITR, restore drills, documented runbooks."* | **PITR mandatory** — independently repeated in a second, distinct chapter, reinforcing rather than narrowing Ch.12 |
| Ch.14 §14.8 (Deployment) | *"Use automated Supabase backups, periodic recovery testing, infrastructure documentation, and rollback procedures for failed deployments."* | Confirms automated backups as a deployment requirement; does not itself name PITR, does not narrow or contradict Ch.12/Ch.16's PITR requirement |
| Ch.20 §20.4 (Production Readiness Checklist) | *"Backups configured"* | Backup configuration (which, per Ch.12/Ch.16, includes PITR) is a named go-live gate item |
| Ch.18 (Future Roadmap, Scalability and Advanced Features) — found this task | *"KPIs: 100k+ users, <500ms API, 99.9% uptime, <2s realtime latency."* | **Not an RPO/RTO decision.** Scoped explicitly to a 100k+-user future-roadmap cluster, not the current MVP/pilot-hostel scale (ADR-011); an aggregate uptime SLA is also a different metric from a single-incident RTO/RPO. Recorded as found, not used to resolve the numeric RPO/RTO gap below — see `ADR-022`'s SDD-requirement table for the full reasoning. |

**Conclusion (corrected 2026-09-07)**: the SDD specifies PITR as a
**mandatory architectural capability for production** — stated identically
and independently in two chapters, with no conditional or hedging language
anywhere, and no later chapter that narrows or exempts it. It is not merely
recommended, and it is not stated as conditional on a numeric RPO — the SDD
simply requires it to exist. **No accepted ADR and no SDD chapter specifies
a numeric RPO, RTO, or PITR retention period.** Per `docs/adr/README.md`'s
source-of-truth hierarchy, this is a genuine, unfilled requirement gap in
*sizing* (which retention window), not in *whether PITR is required at
all* — this distinction was not made clearly in an earlier same-day
revision of this runbook and is corrected here (see
[`ADR-022`](../adr/ADR-022-production-backup-dr-strategy.md)'s correction
note for the full reasoning). See §7 ("RPO/RTO") for the explicit
`REQUIREMENT NOT SPECIFIED` record on the numeric side of this gap.

## 3. Current environment state (updated 2026-09-07, F-04 re-verification)

**A real DigiHostel *staging* Supabase project now exists** (`lhonrqjmlhlehpbxvrag`,
"DigiHostel", region `ap-south-1`, provisioned during F-06-STAGING) —
**this document's earlier claim that no DigiHostel Supabase project existed
at all is now stale and is corrected here.** `YatraSync` remains a separate,
unrelated project on a different account and must never be treated as, or
confused with, DigiHostel's data.

**There is still no production Supabase project.** `docs/current-state.md`
and `docs/adr/ADR-013-deployment-architecture.md` confirm no production
deployment exists; only a staging Render service (`digihostel-api-staging`)
and this one staging Supabase project are live.

**Direct Management API evidence for the staging project's actual backup
capability** (`GET /v1/projects/{ref}/database/backups`, 2026-09-07):

```json
{"region":"ap-south-1","walg_enabled":true,"pitr_enabled":false,"backups":[],"physical_backup_data":{}}
```

- `walg_enabled: true` — the underlying WAL-archiving infrastructure Supabase
  uses for physical backups/PITR is present at the platform level.
- `pitr_enabled: false` — **PITR is confirmed OFF** for this project, not
  merely undocumented.
- `backups: []` — **zero managed daily backups currently exist** for this
  project. This matches Supabase's own documented Free-tier behavior (daily
  backups are a Pro/Team/Enterprise capability; Free projects "should
  maintain their own logical exports" — exactly what `supabase/scripts/backup.mjs`
  exists for) but was verified directly via the API here, not assumed from
  documentation alone.

Consequently: **the staging project currently has NO backup coverage of any
kind unless a manual logical backup is run.** Managed daily backups and PITR
remain unavailable on the current (Free) plan — enabling either is a paid
upgrade this task does not perform, per its own explicit instruction.
Production backup/PITR remains entirely unaddressed, since no production
project exists to enable it on.

**Interim staging DR posture, not a production posture**: this state is an
accepted, explicit, non-production limitation of a pre-launch staging
environment — it is not, and must never be described as, evidence that
DigiHostel's target production architecture is compliant with the SDD's
PITR requirement (§2). See §18/§22 for the corrected target production
architecture (Option E — Hybrid + PITR) this staging state does not yet
implement.

## 4. Recovery decision

Once a production project exists, choose the mechanism based on the
disaster type:

| Situation | Mechanism |
|---|---|
| Need to recover to a specific point in time (e.g. minutes before a bad `UPDATE`/`DELETE`) | **PITR**, once enabled on the production project |
| Need to recover to the most recent daily snapshot | **Managed daily backup restore** (Supabase dashboard) |
| Need an independently-controlled, off-platform copy (e.g. before a risky migration, or for offline archival) | **Logical backup** (`supabase/scripts/backup.mjs`, wraps `supabase db dump`) |
| Need to verify a backup/restore actually works without touching production | **Restore-to-new-project** (Supabase's documented restore-to-new-project flow), or a local isolated-database restore for schema/data verification only (see §6) |
| Production is compromised/must not be touched at all during the test | **Never** restore into the live production project to "test" recovery — always restore elsewhere |

**Never restore into the live production project merely to prove restoration
works.**

## 5. Preconditions

Before performing any real recovery:

- Supabase dashboard/CLI access to the correct production project (verify
  the project ref matches the intended DigiHostel production project —
  never assume; a wrong-project restore is a second disaster).
- Explicit approval from whoever owns the production environment.
- Confirmation of which recovery point is being targeted and why.
- This document, read in full, before acting.

Never store a service-role key, database password, access token, or
connection string in this document or in any file committed to this
repository.

## 6. Recovery procedure

### 6.1 Managed backup / PITR restore (production, once available)

1. In the Supabase dashboard, go to the project's Database → Backups panel.
2. Confirm the available recovery points (daily backup list, or PITR's
   selectable timestamp range).
3. Choose "restore to new project" for verification, or restore in place
   only when explicitly authorized to affect the live project directly.
4. Wait for the restore to complete; record start/end timestamps (§8).
5. Run the validation procedure (§6.3) against the restored target.

### 6.2 Logical backup / restore (any environment, including local)

Take a backup:

```bash
node supabase/scripts/backup.mjs local    # local dev stack
node supabase/scripts/backup.mjs linked   # the CLI's currently-linked project
```

Output is written under `supabase/backups/<target>-<timestamp>/` —
`schema.sql` and `data.sql`. This directory is git-ignored
(`supabase/.gitignore`); never commit it, and never leave it somewhere with
broader access than the database it came from.

Restore into an **isolated target**, never the original database:

```bash
# Local example: a fresh, separate database on the SAME local Postgres
# instance — sufficient to verify DigiHostel's OWN schema/data (see §6.4 for
# what this does and does NOT prove).
docker exec <local-db-container> psql -U postgres -d postgres -c "CREATE DATABASE digihostel_restore_test;"
docker cp supabase/backups/<target>-<timestamp>/schema.sql <local-db-container>:/tmp/schema.sql
docker cp supabase/backups/<target>-<timestamp>/data.sql <local-db-container>:/tmp/data.sql
docker exec <local-db-container> psql -U postgres -d digihostel_restore_test -f /tmp/schema.sql
docker exec <local-db-container> psql -U postgres -d digihostel_restore_test -f /tmp/data.sql
```

For a production logical backup, restore into a **new, separate Supabase
project** (or an equivalent isolated Postgres instance you control) — never
the source project.

### 6.3 Validation procedure

After any restore, verify, in this order:

1. **Schema** — table/index/function counts match the source:
   ```sql
   select count(*) from pg_tables where schemaname='public';
   select count(*) from pg_indexes where schemaname='public';
   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';
   ```
2. **RLS** — every table that should have RLS enabled still does, and the
   policy count matches:
   ```sql
   select count(*) from pg_tables t join pg_class c on c.relname=t.tablename and c.relnamespace='public'::regnamespace where t.schemaname='public' and c.relrowsecurity;
   select count(*) from pg_policies where schemaname='public';
   ```
   **Known gap for a bare-database logical restore (see §6.4): policies that
   call `auth.uid()`/`auth.role()` will fail to create if the target has no
   `auth` schema.** A policy-count mismatch of exactly the self-ownership
   policies (`*_select_own`, `*_update_own`, staff-role policies) is the
   expected signature of this gap, not a sign the backup itself is corrupt —
   confirm by diffing policy names, not just counts.
3. **Critical domain tables** — representative row counts match the source
   for `students`, `parents`, `parent_student_relationships`,
   `trusted_devices`, `leave_requests`, `leave_approval_events`,
   `notifications`, `audit_logs`, `staff`, `hostels`.
4. **Foreign-key integrity to `auth.users`** — only meaningful when the
   target has a real `auth` schema (production restore, or restore-to-new-project):
   ```sql
   select conname, conrelid::regclass from pg_constraint where confrelid = 'auth.users'::regclass;
   ```
5. **pgTAP** (`supabase test db`) — run against the restored target when it
   is a full Supabase-provisioned project (has `auth`/`storage`/`extensions`);
   this is this repository's existing, more rigorous RLS/authorization
   verification (`supabase/tests/database/`) and should be preferred over
   ad-hoc SQL once the target supports it.

### 6.4 Database recovery vs. complete platform recovery — do not conflate these

A successful restore of the `public` schema (DigiHostel's own tables, RLS
policies that don't depend on `auth.*`, functions, indexes, and data) is
**database recovery**, not complete recovery. Confirmed empirically, twice
now (§8), most recently with the *exact* affected objects named and with
genuine actor-level query testing (not just policy counting) — restoring a
logical `public`-schema dump into a database that was not originally
provisioned by Supabase (i.e. lacks the `auth`, `storage`, `vault`,
`extensions` schemas and the `supabase_realtime` publication) loses:

- **Exactly these 10 of 67 policies** — every one with a *direct* inline
  `auth.uid()` reference in its own `USING`/`WITH CHECK` clause (as opposed
  to the 57 policies that call a `public`-schema wrapper function like
  `current_parent_id()`/`is_hostel_admin_for_student()`, which restore and
  — critically — remain *structurally present* even though their own
  function bodies also call `auth.uid()` internally):
  `parents_select_own`, `parents_update_own`, `staff_select_own`,
  `staff_update_own_limited`, `students_select_own`, `students_update_own`,
  `student_room_assignments.sra_select_own_student`,
  `leave_requests.leave_requests_all_reception`,
  `leave_approval_events.lae_select_staff`,
  `leave_approval_events.lae_insert_reception_manual_override`.
- The foreign-key constraints tying `students`/`parents`/`staff` to
  `auth.users` (3 constraints) — `CREATE TABLE`/`ALTER TABLE ... ADD
  CONSTRAINT` statements referencing `auth.users` fail identically to the
  policies above.
- 3 unrelated errors restoring `extensions`-schema objects and 1 restoring
  a `vault`-schema object (platform-managed schemas, not part of a
  `public`-schema dump) — cosmetic for DigiHostel's own domain, since
  nothing in this schema currently depends on either.
- Supabase Auth's own user/session/identity data (never included in a
  `public`-schema dump by design — it is platform-owned, not
  application-owned) — confirmed by 7 distinct `relation ... does not
  exist` errors during the *data* restore, one each for
  `auth.users`/`auth.sessions`/`auth.refresh_tokens`/`auth.refresh_tokens_id_seq`/
  `auth.mfa_amr_claims`/`auth.audit_log_entries`/`supabase_functions.hooks_id_seq`.
- **The `supabase_realtime` publication object itself** — confirmed by
  direct query post-restore (`select * from pg_publication` returns zero
  rows): the base `CREATE PUBLICATION supabase_realtime` is a
  platform-provisioned object a `public`-schema dump never creates, so the
  dump's own `ALTER PUBLICATION supabase_realtime ADD TABLE ...` statements
  (for `leave_requests`/`notifications`/`leave_approval_events` — all three
  correctly present in the dump) fail with `publication "supabase_realtime"
  does not exist`. Matches Supabase's own documentation that Realtime
  publication membership may need reactivating after a manual restore.
- **The `supabase_migrations.schema_migrations` tracking table** — confirmed
  absent post-restore (`information_schema.schemata` has no
  `supabase_migrations` row). A database recovered this way has **no
  migration history at all** from the CLI's perspective; running `supabase
  db push` against it would attempt to reapply every migration from 0000
  onward and fail on already-existing objects. Reconciling this safely
  requires `supabase migration repair` to mark the already-applied versions
  as applied **without re-running them** — not performed here (no
  authorization was sought or needed, since no genuinely-restored *remote*
  target existed this task to apply it to), and never to be done without
  first confirming, object-by-object, that the migration truly is already
  reflected in the target schema.

**Functional impact, confirmed with genuine actor-level queries (§8), not
just a policy count**: e.g. a restored `students_select_own` gap means a
student **cannot read their own `students` row directly** post-restore —
but they *can* still see their own `leave_requests` (via
`leave_requests_select_own_student`, which calls the wrapper function
`current_student_id()` and therefore survives). This is the kind of
partial, specific breakage a bare policy count cannot reveal — direct
actor testing is what makes it visible.

**Complete platform recovery** additionally requires the target to already
be (or become) a real Supabase-provisioned project — either the original
project restored via its own managed backup/PITR, or a genuinely new project
that Supabase's own provisioning has bootstrapped with `auth`/`storage`/etc.
before the logical restore runs. See §9 for the full list of what a database
restore alone does not recover.

## 7. RPO / RTO

**Approved 2026-09-08 (Product Owner decision) — see
[`ADR-022`](../adr/ADR-022-production-backup-dr-strategy.md)'s "Product
Owner Decision" section for the full record:**

- **Required RPO**: **1 hour** — `Product Owner approved, 2026-09-08`. This
  is an approved **architecture target**, not an operationally verified
  capability — see "Approved target vs. verified capability" below.
- **Required RTO**: **1–4 hours** (a range; not collapsed to a single
  value) — `Product Owner approved, 2026-09-08`. Also not yet operationally
  verified.
- **PITR retention**: **7 days** — `Product Owner approved, 2026-09-08`
  (see §11/§18 for the corresponding cost and capability detail).
- **Scale-up review trigger**: these three values must be revisited when
  DigiHostel materially scales or its operational/data-criticality
  requirements change (qualitative trigger, no numeric threshold defined or
  invented).

### Approved target vs. verified capability — do not conflate

Approving RPO=1h/RTO=1–4h/retention=7d records what the production DR
architecture must be built to achieve. **None of these has been
operationally demonstrated.** In particular:

- **Observed local restore duration** (§8): schema + data restore into an
  isolated local database completed in **under 5 seconds** for this
  repository's current (seed-scale) dataset. This number is **not**
  representative of the approved 1–4 hour production RTO and must not be
  quoted as evidence toward it — it used a bare local database at seed
  scale, not a managed PITR restore at production data/WAL volume, and
  excludes the platform-schema bootstrap gap documented in §6.4.
- Supabase's own documentation notes PITR restore duration varies with WAL
  activity and database size — the approved RTO range must eventually be
  demonstrated through an actual restore drill against a
  production-representative target (§20), not inferred from any test
  performed so far.
- **Achievable RPO/RTO today**: not applicable — no production backup/PITR
  exists yet to measure against the approved targets (§3/§11).

### 7.1 RPO — three distinct concepts, not to be conflated

A precise RPO analysis (F-04 Operational DR Design, 2026-09-07) must keep
three different numbers separate:

| Concept | Meaning | Value for each mechanism |
|---|---|---|
| **Backup frequency** | How often a backup is *taken* | Manual logical (Option C, §18): whatever cadence an operator chooses — **today, nothing is scheduled at all**, so frequency is effectively "never, unless someone remembers." Managed daily backup (Option A/D): once per day, Supabase-scheduled. PITR (Option B): continuous WAL archiving, not a discrete "backup event" at all. |
| **Maximum potential data loss** | The worst-case gap between a disaster and the most recent usable recovery point, assuming the mechanism ran as designed | Manual logical, if actually scheduled daily: up to ~24h. Managed daily backup: up to ~24h (disaster could occur just before the next scheduled backup). PITR: bounded only by replication/archiving lag, typically seconds-to-minutes, not hours. |
| **Operationally guaranteed RPO** | What can actually be *promised* today, accounting for real operational gaps (missed runs, no alerting, no verification) | Manual logical (today's actual state): **unbounded** — no schedule, no failure alerting, so the true worst case is "however long it's been since anyone last ran the script by hand," which could be weeks. Managed daily backup: close to the "maximum potential data loss" figure, since Supabase operates the schedule, not this repository's own tooling. PITR: close to its "maximum potential data loss" figure, for the same reason. |

**Conclusion**: without a scheduler, alerting, and a verification loop
(§19), Option C's "daily" framing is aspirational, not operationally true —
this is precisely why Option D (ADR-022) does not rely on the logical-backup
half alone to satisfy the SDD's "automated daily backups" requirement; that
requirement is met by the managed (Pro-tier) half instead.

**Resolved 2026-09-08**: the Product Owner has approved RPO = 1 hour (§7
above). Only PITR (continuous WAL-based recovery) is architecturally
capable of approaching a 1-hour RPO — a daily-only mechanism cannot, by
construction, since a day-old snapshot exceeds a 1-hour data-loss budget
regardless of how reliably the schedule runs. This is consistent with why
PITR (at the approved 7-day retention) is part of the target architecture
(§18/§22), not an optional extra.

**Corrected relationship (2026-09-07, still accurate)**: a missing numeric
RPO never meant PITR itself was optional — the SDD requires PITR
unconditionally (§2, §18). What a missing RPO blocked was choosing *which*
PITR retention tier (7/14/28 days) to purchase — now resolved as 7 days
(§7 above, Product Owner decision).

### 7.2 RTO — variables that affect a real production restore

**Approved target: 1–4 hours (Product Owner, 2026-09-08, §7 above) — not
yet operationally demonstrated.** The ~2 second local schema restore and
<1 second local data restore (§8) are explicitly **not** evidence toward
this RTO. A real production restore's duration depends on variables this
task did not and could not measure without live production infrastructure:

| Variable | Status |
|---|---|
| Database size | **Measurable today for staging** (`supabase inspect db db-stats --linked`, 2026-09-07, real evidence): staging database size **14 MB**, WAL size **80 MB**. Production size is unknown (no production project exists) and will very likely differ materially by the time of any real disaster. |
| WAL volume | Same source: 80 MB WAL for a 14 MB database at this early, pre-launch stage — WAL volume already exceeds the base database size, a relevant signal for PITR restore-time planning even though it cannot be extrapolated to a production figure. |
| Backup type | Logical dump/restore (tested, §6.2/§8) vs. managed daily-backup restore vs. PITR restore — each has a materially different restore mechanism and is not interchangeable for RTO purposes. |
| Restore mechanism | `psql -f` (self-service, tested) vs. Supabase's own managed restore pipeline (dashboard-driven, not tested — no live drill performed, per this task's no-mutation instruction). |
| Project (re)provisioning | Not measured — creating a genuinely new Supabase project (for a restore-to-new-project drill) has its own provisioning latency, never timed in this repository's history. |
| Configuration restoration | Not measured — env vars, Auth provider settings, custom domain (if any) are never part of a database restore (§9) and must be manually reconfigured; the time this takes has never been exercised. |
| Auth restoration | Only relevant to a managed restore (path B, §9) — not independently timed; the logical-dump path (A) never restores Auth at all, by design. |
| Realtime configuration | Confirmed to require manual re-verification post-restore either way (§6.4/§9); time to detect and fix a missing publication has not been measured. |
| Storage/external services | Not applicable today (§10 — no Storage usage exists), so no restore-time contribution currently; would need its own timing once adopted. |
| Application deployment | Re-pointing `apps/api` (Render) at a recovered database is a separate, un-timed manual step (§9's "Manually reconfigured" rows). |
| DNS/runtime recovery | Not applicable today — no custom domain is configured for either staging or (nonexistent) production. |
| Validation | The structural/RLS/actor-level validation performed in §6.3/§8 took a few minutes of active operator time this task, but that included investigation and documentation, not a rehearsed, timed drill — not representative of a practiced recovery's validation time. |

**What can be measured today**: local, seed-scale, schema/data logical
restore duration (§8) and current staging database/WAL size (this section).
**What cannot currently be measured, and must not be estimated by
inference**: end-to-end production RTO, which depends on a production
database that does not yet exist, at a scale not yet known, restored via a
mechanism (managed backup/PITR) never yet exercised live.

## 8. Last tested

- **Most recent test date**: 2026-09-08 (§8.1 below — first rehearsal
  sourced from the real linked staging project, superseding this section's
  own 2026-09-07 local-dev-stack test with fresher, more representative
  evidence; both remain valid and are kept for the full historical record)
- **Test date**: 2026-09-07 (F-04 re-verification; supersedes the 2026-09-05
  test's policy-count-only evidence with genuine actor-level query results)
- **Environment**: local Supabase Docker stack (`supabase_db_DigiHostel`
  container), this repository's own dev environment — **not** staging or
  production.
- **Recovery mechanism tested**: logical backup/restore (`node
  supabase/scripts/backup.mjs local` → `psql` restore into a freshly
  created, isolated database — `digihostel_restore_test` — on the same
  local Postgres server, never overwriting the original dev database).
- **Backup/recovery point**: the local dev database's live state at test
  time. Checksums recorded at backup time (SHA-256, not reproduced here —
  ephemeral, deleted with the backup artifact after verification).
- **Schema restore**: started 2026-09-06T23:30:08Z, completed
  2026-09-06T23:30:10Z (~2s). 2,353 statements; 21 errors, all attributable
  to the platform-schema gap (§6.4) — 13 `auth`-dependent (10 policies + 3
  FKs), 4 `supabase_realtime`-publication, 3 `extensions`-schema, 1
  `vault`-schema. Zero unexpected errors.
- **Data restore**: completed in under 1 second. 7 errors, all
  Auth/platform-owned relations (§6.4). Zero unexpected errors — every
  DigiHostel-domain table loaded cleanly.
- **Schema comparison** (source `postgres` vs. restored
  `digihostel_restore_test`): tables 17=17, indexes 58=58, functions 9=9,
  RLS-enabled tables 17=17 — all exact matches. Policies 67 (source) vs. 57
  (restored) — the exact, named 10-policy gap in §6.4.
- **Data comparison**: all 13 inspected domain tables (students, parents,
  staff, hostels, rooms, parent_student_relationships, trusted_devices,
  device_attestation_events, leave_requests, leave_approval_events,
  notifications, audit_logs, security_incidents) matched the source row
  count **exactly**.
- **RLS actor-level verification (new this test — not done 2026-09-05)**: a
  minimal, explicitly-labeled `auth.uid()` test stub (reads the same
  `request.jwt.claims` GUC the real Supabase implementation uses; creates
  no other Auth object) was added to the restored database *solely* to make
  the 57 surviving policies queryable with genuine, distinct,
  non-privileged actors (`set local role authenticated` +
  per-actor JWT claims — never `postgres`/service-role). Results:
  student1 (own leave request ✅, own profile row ❌ — precisely the
  documented `students_select_own` gap), student1→student2 cross-access
  denied ✅, parent1 (linked)→student1 allowed ✅, guardian→own ward
  allowed/cross-ward denied ✅, unrelated parent3→both students denied ✅,
  reception1 (Kalinga)→own-hostel allowed/cross-hostel denied ✅,
  reception2 (Utkal)→reverse-direction confirmed ✅, hostel_admin1→own-hostel
  security_incidents allowed/cross-hostel denied ✅, super_admin→global
  access to both students and both incidents ✅. **8 of 9 checks behaved
  exactly as expected; the one exception is the precisely-predicted,
  already-documented `students_select_own` gap — not a surprise.**
- **Realtime publication**: confirmed **not** restored — `select * from
  pg_publication` returns zero rows post-restore (§6.4).
- **Migration history**: confirmed **not** restored — no
  `supabase_migrations` schema exists post-restore (§6.4).
- **Result**: **Database-level restore succeeded for DigiHostel's own
  schema and data**, now verified with genuine actor-level query behavior,
  not merely object counts. Test artifacts (backup files, the isolated test
  database, the auth stub) were deleted/dropped immediately after
  verification — nothing was left behind.
- **PITR/managed-backup restore**: **NOT PERFORMED** — confirmed
  unavailable on the current staging plan (§3: `pitr_enabled: false`,
  `backups: []`), and no production project exists to test either
  mechanism against. Not authorized or attempted, per this task's explicit
  instruction.

### 8.1 F-04-DR-REHEARSAL, 2026-09-08 — first rehearsal sourced from the real linked staging project

Every rehearsal before this one dumped from the **local** dev Docker stack.
This is the first rehearsal in this series to dump directly from the real,
linked **staging** Supabase project (`lhonrqjmlhlehpbxvrag`) — a more
representative test of what a real recovery from that project would
actually look like.

- **Mechanism**: `node supabase/scripts/backup.mjs linked`, restored via
  `psql` into a freshly created, isolated database (`f04_dr_rehearsal`, on
  the same local Postgres server the local dev stack runs on) — never
  overwriting staging or the local dev database.
- **Backup**: started 2026-09-08T08:53:21Z (first attempt, failed — see
  below), successfully re-run starting 2026-09-08T09:26:46Z, completed
  ~09:28:27Z (~1m41s). `schema.sql` 445,622 bytes, `data.sql` 267,530
  bytes. SHA-256 checksums computed at backup time (not reproduced here —
  ephemeral, deleted after verification).
- **Environment note**: the first attempt this day failed before producing
  any artifact because Docker Desktop's backend was not running in the
  operator's environment (`supabase db dump` requires Docker to run a
  version-matched `pg_dump`); once Docker was confirmed available, the
  rehearsal was re-run in full from the beginning — nothing about this
  section's results was inferred or reused from the failed attempt.
- **Schema restore**: 21 errors, the exact same named set as every prior
  rehearsal (13 `auth`-dependent [10 policies + 3 FKs], 4
  `supabase_realtime`-publication, 3 `extensions`-schema, 1 `vault`-schema)
  — zero unexpected errors, fully reproducible across a different backup
  source.
- **Data restore**: only **1** error this time (`auth.refresh_tokens_id_seq`
  does not exist), materially fewer than the 7 seen restoring a local-dev
  dump — because the real staging project's `auth.users` and related
  tables are genuinely empty (no real sign-ups have ever occurred on
  staging), unlike the local dev stack, which had manually-seeded test
  Auth rows from earlier verification tasks. Zero unexpected errors.
- **Schema comparison** (live staging vs. restored `f04_dr_rehearsal`):
  tables 17=17, indexes 58=58, functions 1088=1088 (full `public`-schema
  function count, including extension-provided functions — 9 of these are
  DigiHostel's own domain helpers), RLS-enabled tables 17=17, non-internal
  triggers 6 (source, includes 5 platform-managed triggers on
  `storage.*`/`realtime.*` — never expected to restore, since those
  schemas are platform-owned) vs. 1 (restored — exactly DigiHostel's own
  `trusted_devices_revoke_only` trigger, the only one that should
  restore, and did) — all exact, fully explained matches. Constraints: 38
  (source) vs. 35 (restored) — the exact 3-FK gap (§6.4). Policies: 67
  (source) vs. 57 (restored) — the same named 10-policy gap as every prior
  rehearsal, confirmed via a full name-by-name diff, not just a count:
  `parents_select_own`, `parents_update_own`, `staff_select_own`,
  `staff_update_own_limited`, `students_select_own`, `students_update_own`,
  `student_room_assignments.sra_select_own_student`,
  `leave_requests.leave_requests_all_reception`,
  `leave_approval_events.lae_select_staff`,
  `leave_approval_events.lae_insert_reception_manual_override`.
- **Data comparison**: staging's own domain tables are almost entirely
  empty — 16 of 17 tables have 0 rows (staging was provisioned for
  infrastructure verification, never seeded with demo/pilot data); only
  `audit_logs` has 2 real rows. **This sparseness is stated plainly, not
  glossed over.** All 17 tables matched the source row count exactly
  (16×0, `audit_logs`×2), and — going beyond a count match — a
  deterministic MD5 checksum over every `audit_logs` row's full content
  matched exactly between source and restored (`0c0887f4eb1a125d3f01a24bd811cc1e`
  on both), genuine proof of content-level fidelity, not just row counts.
- **RLS actor-level verification**: since staging's domain tables were
  empty, minimal synthetic fixtures (2 hostels, 4 staff, 2 rooms, 2
  students, 3 parents, 2 relationships, 1 leave request, 2 security
  incidents) were inserted **only into the isolated `f04_dr_rehearsal`
  database** — never into staging — alongside the same test-only
  `auth.uid()` stub used in every prior rehearsal. 11 genuine,
  distinct-actor checks were run (`set local role authenticated` +
  per-actor JWT claims, never postgres/service-role): student1 (own leave
  request ✅, own profile row ❌ — the same predicted `students_select_own`
  gap), student1→student2 denied ✅, parent1→own child ✅, guardian→own
  ward ✅/cross-ward denied ✅, unrelated parent→both denied ✅, reception1
  (Kalinga)→own-hostel ✅/cross-hostel denied ✅, reception2 (Utkal)→reverse
  confirmed ✅, hostel_admin1→own-hostel incidents ✅/cross-hostel denied ✅,
  **`trusted_devices` INSERT by `authenticated` correctly rejected by RLS**
  ✅ (F-01 remediation, freshly confirmed on this restored target),
  **`audit_logs` correctly returns 0 rows to `authenticated`** ✅ (no
  client-facing SELECT policy — audit-log access restricted as intended),
  super_admin→global access to both students/incidents ✅. **10 of 11
  checks behaved exactly as predicted; the one exception is the same,
  already-documented `students_select_own` gap.**
- **API reconnection test — genuinely performed, not skipped**: the
  compiled `apps/api/dist/index.js` was started as a real process with
  `DATABASE_URL` pointed at the isolated `f04_dr_rehearsal` database (never
  staging), `SUPABASE_URL` pointed at the real staging project (for JWKS
  fetch only — no data access) so the JWT verifier could initialize.
  **Startup succeeded in full**: pg-boss self-provisioned its own
  `pgboss` schema against the restored database (confirming pg-boss's
  schema is genuinely separate from the `public`-schema domain dump and
  self-recreates on a fresh target, not lost), all 3 workers registered,
  Fastify began listening. `GET /healthz` → `200 {"status":"ok"}`. `GET
  /readyz` → `200 {"status":"ok"}` — **genuine, direct proof the restored
  database is reachable and query-able (`select 1`) by a real running
  application process**, not just by `psql`. `GET /leave-requests` with no
  token → `401 unauthenticated`; with a garbage token → `401`, logged
  server-side as `code: "invalid_signature"` — proving the JWT verifier is
  genuinely and correctly validating signatures against the real JWKS
  endpoint, not merely short-circuiting. The process was then stopped
  cleanly (`SIGTERM`).
  - **Classification, exactly as required — not overstated**: **database
    restoration: VERIFIED. API reconnection (liveness + readiness + the
    unauthenticated/invalid-token rejection path): VERIFIED.** A genuine
    **authenticated success path (a real valid session reading actual
    restored data) was NOT tested and is NOT VERIFIED** — no real
    Supabase Auth session exists to test with, since the restored target
    has no real `auth` schema and staging itself has no real registered
    users. **Full application recovery is NOT claimed** — only the
    specific paths above were actually exercised.
- **Realtime/application recovery boundary**: publication state —
  confirmed **absent** post-restore (`select count(*) from pg_publication`
  → 0), same as every prior rehearsal. Classified **PARTIALLY VERIFIED**:
  publication-configuration state was directly checked (NOT VERIFIED →
  confirmed missing, which is itself a verified fact); the RLS policies
  Realtime depends on for the 3 affected tables were confirmed present
  (2 of 3 survive via wrapper functions; `leave_requests_all_reception` is
  part of the named 10-policy gap); application subscription code
  compatibility and actual WebSocket delivery were **not** exercised (no
  live Realtime channel exists on a bare-restored target to test against);
  documented reactivation steps already exist (§6.4, §9). Not upgraded to
  "VERIFIED" for any part not actually tested.
- **Migration history**: confirmed **not** restored — no
  `supabase_migrations` schema exists post-restore, same as every prior
  rehearsal.
- **Measurements**: backup ~1m41s; DB creation + schema restore + data
  restore combined ~43s (09:30:05Z→09:30:48Z); total rehearsal (backup
  through cleanup) ~15 minutes. **These are local/small-dataset
  measurements and are explicitly not evidence toward the approved
  production RTO of 1–4 hours or RPO of 1 hour** (ADR-022) — the current
  Free-tier rehearsal cannot demonstrate either, since Free provides no
  managed backups/PITR to measure (§7).
- **Cleanup**: the isolated `f04_dr_rehearsal` database was dropped, the
  backup artifact directory removed, all temporary SQL scripts and logs
  deleted, and the test API process stopped — confirmed via `git status
  --short` showing no unintended artifacts and `pg_database` no longer
  listing `f04_dr_rehearsal`.
- **Result**: **Free-tier DR capability re-confirmed with fresh evidence,
  for the first time sourced directly from the real staging project rather
  than the local dev stack, with results fully consistent with every prior
  rehearsal** — the same named 10-policy gap, the same Realtime/migration-history
  exclusions, and — new this rehearsal — genuine proof the restored
  database is usable by a real running `apps/api` process, not merely by
  `psql`.

## 9. Auth recovery: managed restore vs. manual logical dump — and application recovery implications

**These are two genuinely different recovery paths with different
guarantees. Do not conflate them.**

| | A. Manual logical dump/restore (`supabase/scripts/backup.mjs` + this runbook's §6.2) | B. Supabase managed "Restore to New Project" |
|---|---|---|
| Auth users/identities | **Not included at all** — confirmed empirically (§6.4/§8): the data restore throws 7 distinct errors for `auth.*` relations that don't exist on a bare target; even against a real Supabase-provisioned target, a `public`-schema-only dump never contains `auth.users` rows by design | **Included** — per Supabase's own documented Restore-to-New-Project behavior, Auth user data is carried over as part of the managed restore |
| Auth settings (providers, redirect URLs, email templates, MFA config) | Not applicable — never captured by either path | **Requires manual reconfiguration** — Supabase's own documentation states Auth settings and API keys must be manually reconfigured post-restore even on the managed path |
| RLS policies / functions / `public`-schema data | Restored, with the exact named 10-policy gap (§6.4) on a *bare* (non-Supabase) target; fully restorable with zero gap on a genuinely Supabase-provisioned target | Restored (it's the same underlying database being moved) |
| `supabase_realtime` publication | **Not restored** on a bare target (§6.4/§8) | Not verified by this task — Supabase's own CLI restore documentation itself notes Realtime publication settings may need reactivating even after a managed restore; do not assume otherwise without direct verification |
| Storage objects | Never included (database-only) | Not included either — Supabase documents that database backups/restores do not include Storage objects themselves |
| Effort/control | Fully self-service, works against any Postgres target, but the operator owns every gap above | Requires Supabase dashboard/support access; less manual reconciliation, but was **not performed or authorized in this task** |

**Neither path was exercised against the real staging or a production
project this task** — only the manual path, against a local isolated
database, per this task's explicit "do not modify the production database
/ do not use the existing staging project as a restore target" instruction.
A managed restore-to-new-project drill against a genuinely disposable
Supabase project remains a real, un-exercised verification gap.

A database restore — by either path — is not a complete application
restore. Status of each additional component, as verified in this
repository today:

| Component | Status | Notes |
|---|---|---|
| Supabase Auth (users/sessions/identities) | **Not applicable to path A**; included in path B | See table above |
| API (`apps/api`) environment variables/secrets | **Manually reconfigured** | `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`DATABASE_URL` etc. are process env vars, never stored in the database — must be re-pointed at the recovered project by whoever operates the deployment |
| Realtime (`supabase_realtime` publication) | **Manually reconfigured** | Confirmed empirically, twice now: the publication object itself does not exist post-restore on a bare target (§6.4/§8); a real project restore of either kind must re-verify it exists (`supabase/migrations/0002_realtime_publication.sql`, `0007_f08_leave_approval_events_realtime.sql`) |
| pg-boss scheduled jobs (escalation/notification queue) | **Not yet verified** | pg-boss's own internal tables (`pgboss.*`) are not part of DigiHostel's `public`-schema domain dump scope tested here; a real recovery must confirm pg-boss re-initializes its schema and any in-flight jobs are handled per `apps/api/src/workers/`'s own crash-recovery design (F-03), not assumed recovered by this runbook |
| Push notification (Expo) configuration | **Not applicable** | No real push credentials exist in this repository yet (`docs/current-state.md`) |
| EAS / Expo mobile build configuration | **Not applicable to database recovery** | Independent of database state |
| API deployment configuration (Render) | **Manually reconfigured** | ADR-021 selected Render (superseding ADR-013's Vercel clause) — a staging service exists (`digihostel-api-staging`); its own env vars (`DATABASE_URL` etc.) would need re-pointing at a recovered database, same as any other deployment target |
| Domain / external provider configuration | **Not applicable** | None configured yet |
| Storage objects | **Not applicable today** | No Storage usage exists in this schema today; if adopted later, note that Supabase documents Storage objects as excluded from database backups/restores regardless |

## 10. Storage / external-service recovery classification

None of these are covered by a database backup/restore. Classified as
verified in this repository today (2026-09-07):

| Service | Status | Notes |
|---|---|---|
| Supabase Storage | **Not currently used** | `apps/parent-mobile/src/services/supabase/storage.ts` is an unused scaffold (`getStorageBucket()`) — no bucket is configured anywhere, confirmed by repository-wide search; no MVP requirement needs one yet. If adopted later: Supabase documents Storage objects as excluded from database backups/restores regardless, so it would need its own replication/versioning strategy, not something this runbook currently provides |
| Supabase Edge Functions | **Not currently used** | No `supabase/functions/` directory exists in this repository |
| Supabase Vault | **Not currently used** | The `vault` schema is platform-provisioned (confirmed by the bare-restore's `vault`-schema error, §6.4) but DigiHostel's application code never reads or writes it — no secrets are stored there |
| External object storage (S3-compatible, etc.) | **Not currently used** | No such dependency exists in `package.json`/config anywhere in this repository |
| Expo Push credentials | **Future requirement** | No real push credentials/tokens exist yet (`docs/current-state.md`); the notification worker already handles "no token" as an ordinary delivery rejection |
| Render service configuration (env vars, `render.yaml`) | **Manually reconfigured, separately from any database restore** | Render env vars (`DATABASE_URL`, `SUPABASE_URL`, etc.) live in Render's own dashboard/API, not the database; a recovered database requires someone to re-point these manually. Render's own deploy history is Render's operational domain, outside this runbook's scope |
| GitHub Actions secrets (`RENDER_DEPLOY_HOOK_URL`, etc.) | **Manually reconfigured, separately from any database restore** | Stored in GitHub's own encrypted secret store; recovery is a repository-administration action (`gh secret set`, re-entering the value), not a database concern. Secret plaintext values are never written to a file or logged by this repository's tooling |

## 11. PITR — dedicated verification (distinct from logical backup)

Point-in-time recovery is a materially different capability from the
logical backup/restore exercised in §6–§8: PITR lets an operator recover to
an arbitrary timestamp using continuous WAL archiving, rather than to the
single moment a manual `pg_dump` was taken.

**Direct evidence, not inferred from plan documentation** (Management API,
`GET /v1/projects/{ref}/database/backups`, 2026-09-07, staging project
`lhonrqjmlhlehpbxvrag`):

```json
{"region":"ap-south-1","walg_enabled":true,"pitr_enabled":false,"backups":[],"physical_backup_data":{}}
```

- `pitr_enabled: false` — PITR is **confirmed disabled**, a hard fact from
  the platform's own API, not an assumption drawn from "Free tier probably
  doesn't support it."
- `walg_enabled: true` means the WAL-archiving substrate PITR depends on is
  present at the infrastructure level, but this does **not** mean PITR is
  available to this project — it is a platform-internal implementation
  detail, not an enablement signal, and must not be read as "PITR is
  effectively on."
- `physical_backup_data: {}` — no physical (base+WAL) backup currently
  exists to recover from even if PITR were toggled on today.

**What was NOT done, and why:**
- PITR was **not enabled** — doing so is a paid plan upgrade, which this
  task's own instructions explicitly prohibit performing without separate
  authorization.
- A live PITR restore drill was **not performed** — there is nothing to
  restore from (`pitr_enabled: false`, no physical backup data), and even
  if there were, this task's instructions prohibit mutating the existing
  staging project or using it as a restore target.
- No PITR "simulation" that fabricates a result is provided here. The
  correct, honest statement is: **PITR procedure is documented (§6.1,
  Supabase's own dashboard-driven restore-to-timestamp flow) but not
  live-verified, because the current staging plan does not provide PITR.**
  This is a plan-tier limitation, not a defect in this repository's own
  tooling or process.

**Conclusion**: PITR readiness for DigiHostel is **UNAVAILABLE ON CURRENT
PLAN**, distinct from and in addition to logical-backup readiness (§6–§8),
which was independently and successfully verified. Enabling PITR (a
Pro-tier-or-above capability) and then re-running this section's drill is
a genuine, tracked, pre-production requirement — not something this task
resolves. **This is a mandatory SDD requirement (§2), not an optional
enhancement** — "unavailable on current plan" describes staging's Free-tier
limitation, not a statement that PITR is dispensable for production; see
§18/§22 for the corrected target production architecture.

**Retention approved (2026-09-08, Product Owner decision)**: when PITR is
eventually enabled on a production project, it must be configured at the
**7-day retention tier** ($100/month, verified live pricing, §18) — not
14 or 28 days. This is a settled product decision, not a recommendation
this runbook makes on cost/technical grounds (see
[`ADR-022`](../adr/ADR-022-production-backup-dr-strategy.md)'s "PITR
Retention Tier Analysis"). Enabling it and re-running this section's drill
remains the pre-production action item — approving the *target* does not
perform the *enablement*.

## 12. Backup integrity and restore correctness

- **Backup integrity** — the local logical backup produced this task
  (`supabase/scripts/backup.mjs local`) was verified via SHA-256 checksum
  computation immediately after creation (recorded at test time; the
  artifact itself was deleted after verification per this task's
  no-leftover-artifacts posture) and via successful, error-bounded restore
  (§8) — a backup file that produces a schema/data restore with only the
  expected, named platform-schema-gap errors (§6.4) and zero unexpected
  errors is treated as integrity-verified for this test's purposes. No
  backup was left corrupted, truncated, or partially written to disk.
- **Restore correctness — structural** (done, §8): table/index/function/RLS
  counts and 13 domain tables' row counts matched the source exactly.
- **Restore correctness — authorization behavior** (done, §8): genuine
  actor-level RLS queries against the restored target, not just policy
  presence counts.
- **Restore correctness — application-level smoke check**: **not performed
  this task.** Starting `apps/api` against the restored
  `digihostel_restore_test` database and confirming `/healthz`/`/readyz`
  return `200` was considered but not executed, because doing so would
  require pointing a real API process at a bare (non-Supabase-provisioned)
  database that is missing the `auth` schema entirely — `apps/api`'s JWT
  verification (`apps/api/src/lib/auth/jwt.ts`) depends on a real Supabase
  project's JWKS endpoint, which a bare local restore target has no
  equivalent of. Standing up a full apps/api instance against it would
  either require faking JWKS (a bigger, out-of-scope change to prove a
  narrower point) or would only meaningfully validate `/readyz`'s raw
  DB-connectivity check, which the psql-level validation in §6.3/§8 already
  establishes more directly. **Recorded here as a genuine, un-closed gap**:
  the true end-to-end "does apps/api actually come up against a restored
  database" smoke check has only ever been exercised against Supabase-
  provisioned targets (local dev, staging) that were never themselves
  through a restore cycle in this task — it should be exercised the next
  time a genuine Supabase-provisioned restore target (a real
  restore-to-new-project) is authorized.

## 13. Crash / interruption recovery (reasoned, not live-tested)

A restore interrupted mid-way (process killed, connection dropped, disk
full) was not deliberately triggered this task — doing so against a real
target risks leaving a genuinely corrupt database with no defined recovery
path of its own, which is not a risk worth taking to observe an outcome
that follows directly from Postgres's own documented transactional
semantics. Reasoned from that documented behavior instead:

- **Schema restore** (`psql -f schema.sql`): the dump `supabase db dump`
  produces is a flat sequence of DDL statements, not wrapped in one
  transaction (confirmed by inspecting the generated file — no leading
  `BEGIN`/trailing `COMMIT`). An interruption partway through **leaves a
  partially-created schema** — some tables/functions/policies exist, others
  don't. This is not idempotently re-runnable as-is: re-running the same
  script against the same target will fail on `CREATE TABLE`/`CREATE
  POLICY` statements for objects that already succeeded. **Correct recovery
  from an interrupted schema restore is to drop the partially-created
  target database/schema entirely and restart the restore from a clean
  target** — exactly the isolated-target pattern this runbook already
  mandates (§6.2), which is what makes this safe: a partial failure never
  touches the source or any pre-existing database.
- **Data restore** (`psql -f data.sql --data-only`): each table's `COPY`/
  `INSERT` block is independent; an interruption partway through can leave
  some tables fully loaded and others partially or not loaded, with no
  automatic rollback across tables. The same remediation applies: treat a
  partial data restore as untrustworthy in aggregate and restart from a
  clean target rather than attempting to "top up" a partial one.
- **Managed backup/PITR restore** (§6.1, not available on the current
  plan): Supabase's own restore-to-new-project/PITR flows are
  platform-orchestrated operations, not a script this repository invokes
  directly — an interruption's recovery path there is Supabase's own
  operational responsibility (retry via the dashboard/support), not
  something this runbook's local tooling controls or can simulate
  meaningfully.
- **Conclusion**: the manual logical-restore path is **not
  crash-atomic**, and the mitigating control is procedural, not technical —
  always restore into a disposable, isolated target so a failed attempt is
  simply discarded and retried, never a target that must remain consistent
  throughout. This is already this runbook's standing practice (§6.2), so
  the residual risk is limited to wasted time on a retry, not data loss.

## 14. Backup retention and security

**Retention:**
- Managed daily backups for the staging project: **zero exist**
  (`backups: []`, §3/§11) — there is nothing to retain, and no retention
  window to report, because no managed backup has ever been taken.
- Manual logical backups (`supabase/scripts/backup.mjs`): **no retention
  policy exists** — the script produces a timestamped directory under
  `supabase/backups/` (git-ignored) and nothing deletes old ones
  automatically; nothing schedules new ones automatically either (§16,
  unchanged open gap). Retention is currently whatever an operator manually
  chooses to keep on their own machine — **not durable, not off-site, not
  automated.**

**Security, verified this task:**
- Backup files never enter Git — `supabase/.gitignore` covers
  `supabase/backups/`, confirmed still in effect; `git status` throughout
  this task's live backup/restore work showed no backup artifact ever
  appeared as untracked/staged.
- No credentials are embedded in the backup tooling — `supabase/scripts/backup.mjs`
  relies entirely on the Supabase CLI's own `supabase link`/local-stack
  connection state; it never reads, logs, or writes a database password,
  service-role key, or connection string.
- All restore testing this task used an isolated, disposable target
  (`digihostel_restore_test`) that was dropped immediately after
  verification — no lingering copy of restored data exists anywhere.
- Only local development/seed data was ever backed up or restored this
  task — no production or staging data was copied, exported, or handled at
  any point (staging's `linked` target was never actually dumped this
  task; only `local` was exercised).
- **Access control / deletion-protection implication**: because the
  staging project currently has zero managed backups, deleting that
  Supabase project today would destroy the live database with **no
  platform-level backup to fall back on at all** — the *only* recovery path
  for staging right now is whatever manual logical backup an operator has
  separately chosen to run and store outside the platform (§16), and none
  is currently scheduled. This is the single most material, concrete
  consequence of the `backups: []` finding in §3/§11, and is carried
  forward into §17's open-gaps list.

## 15. Rollback / containment

- Never run a restore procedure against the live production project as a
  "test" — always restore to a new project or an isolated database.
- Before starting any real recovery, confirm (via the Supabase dashboard's
  project name/ref, never by assumption) which project you are about to
  act on.
- If a restore-to-new-project is used for verification, the original
  project is untouched by construction — no rollback is needed for it.
- If an in-place production restore is ever authorized, take a fresh backup
  of the current (possibly-disastrous) state first, so that action remains
  reversible.

## 16. Off-site logical backup

`supabase/scripts/backup.mjs` (added by this remediation) wraps `supabase db
dump` for both `local` and `linked` targets. It embeds no credentials —
`--linked` relies entirely on the Supabase CLI's own `supabase link` state.
Output is written to `supabase/backups/`, which is git-ignored; operators
are responsible for moving a real backup to actually-durable, access-controlled
storage outside this working directory (this script only produces the file,
it does not itself implement off-site storage/retention — that is a
deployment/infrastructure decision, out of this task's scope per its own
"do not implement deployment" instruction).

## 18. Backup strategy options and cost (F-04 Operational DR Design, 2026-09-07; corrected 2026-09-07)

Full analysis and the formal decision record live in
[`ADR-022`](../adr/ADR-022-production-backup-dr-strategy.md) (status
**ACCEPTED, 2026-09-08**) — this section summarizes it for operational
reference; ADR-022 is authoritative if the two ever diverge.

**Correction**: an earlier same-day revision of this section recommended
Hybrid-without-PITR as the production target and described PITR as an
RPO-gated future upgrade. That was inconsistent with the SDD, which states
PITR as a required capability in the same unqualified form as daily backups
(Ch.12 §12.7, Ch.16 §16.7 — see §2) — independent review caught this and it
is corrected below. An architecture lacking PITR is **not** production-SDD-compliant,
regardless of cost convenience.

| Strategy | Daily backups | PITR | Off-site logical backup | SDD compliance |
|---|---|---|---|---|
| Free/manual (today's actual staging state) | No (manual only, currently unscheduled) | No | Capability exists, not practiced on a schedule | **Not compliant** — fails "automated daily backups" and PITR |
| Pro daily (Option A) | Yes, managed | No | No | **Not compliant** — fails PITR |
| Pro + PITR (Option B) | Yes, managed | Yes | No | Partially compliant — meets backups+PITR, lacks an independent off-platform copy |
| Hybrid without PITR (Option D) | Yes, managed | No | Yes | **Not compliant** — fails PITR; this is the honest description of what staging's Free plan limits it to today, not a production recommendation |
| **Hybrid + PITR at 7-day retention (Option E — TARGET, ACCEPTED)** | Yes, managed | **Yes (7-day, Product Owner approved 2026-09-08)** | Yes | **Fully compliant** — the only row that satisfies every SDD element identified in §2 |

An architecture lacking a specified, mandatory SDD capability (PITR) is not
production-compliant, regardless of how convenient or cost-effective the
alternative is — no row above is marked compliant unless it actually
includes PITR.

**Cost** (E1 = verified live this session via this project's own Management
API; E2 = Supabase's published pricing, not independently re-verified this
session — org-level billing endpoints were unreachable with this task's PAT
scope):

| Option | Cost | Evidence |
|---|---|---|
| Pro base subscription | ~$25/month (published figure) | E2 |
| **PITR add-on, 7-day retention — APPROVED (Product Owner, 2026-09-08)** | **$100/month** | E1 |
| PITR add-on, 14-day retention (evaluated, not chosen) | $200/month | E1 |
| PITR add-on, 28-day retention (evaluated, not chosen) | $400/month | E1 |

**These are not permanent price guarantees. Pricing must be re-verified
immediately before the production scale-up decision** — do not act on the
figures above without reconfirming them at that time.

No plan was changed, no addon purchased, and no currency figure was invented
by this task — no PITR configuration has been enabled anywhere; this is a
recorded product decision, not an implementation action.

**Target production architecture, ACCEPTED (2026-09-08)**: Option E
(Hybrid + PITR at 7-day retention). PITR is required unconditionally by the
SDD, not contingent on RPO; the Product Owner has now separately supplied
RPO (1 hour), RTO (1–4 hours), and the PITR retention tier itself (7 days)
— see §7 above and [`ADR-022`](../adr/ADR-022-production-backup-dr-strategy.md).

> **Product Owner approved (2026-09-08)** — RPO = 1 hour, RTO = 1–4 hours,
> PITR retention = 7 days. These are approved architecture **targets**;
> none has been operationally verified (§7's "Approved target vs. verified
> capability"), and no production infrastructure implementing them exists
> yet (§22). A qualitative scale-up review trigger requires revisiting all
> three when DigiHostel materially scales or its operational criticality
> changes.

## 19. Backup automation design (design only — not implemented)

`supabase/scripts/backup.mjs` (inspected in full this task) is a thin,
credential-free wrapper around `supabase db dump`, invoked manually. It has
**no**: scheduler, credential-refresh handling beyond the CLI's own linked
session, failure detection beyond a non-zero exit code halting the script,
retries, checksum verification (checksums were computed manually, ad hoc,
during F-04's own test — not built into the script), off-site upload,
retention/cleanup of old backup directories, alerting, an audit trail beyond
console output, duplicate-execution guarding, partial-backup-corruption
detection, or explicit clock/timezone handling (relies on JS `Date.toISOString()`,
which is UTC by construction — adequate, but not deliberately documented
until now).

**Existing manual backup capability ≠ production backup automation.** What
production-grade automation would require, if Option D (or C) is ever relied
upon as more than a supplementary copy:

- **Scheduler**: a cron/CI job (e.g. a scheduled GitHub Actions workflow) —
  not created by this task, per its explicit "do not add CI backup jobs"
  instruction.
- **Credentials**: the scheduler would need its own `SUPABASE_ACCESS_TOKEN`
  (for `--linked`) as a CI secret, following this repository's existing
  secret-handling pattern (`gh secret set`, never echoed) — not added by
  this task.
- **Failure detection/alerting**: a non-zero exit from `backup.mjs` today
  only fails the invoking shell; there is no notification path (no Slack/
  email/paging integration exists in this repository for any purpose yet).
- **Retries**: none today — a transient `supabase db dump` failure (network
  blip) simply fails the run with no automatic retry.
- **Checksum verification**: would need to be built into the script itself
  (compute + store a SHA-256 alongside each backup) rather than performed
  manually as this task's own verification did.
- **Off-site upload**: the script only writes locally, under
  `supabase/backups/` — genuinely durable off-site storage is an
  infrastructure decision this task does not make (§16 — provider selection
  remains an explicit open decision).
- **Retention cleanup**: nothing deletes old backup directories; unbounded
  local accumulation is the current (non-production-relevant, since this
  directory is git-ignored and local-only) behavior.
- **Auditability**: console output only — no persistent, queryable record of
  "backup N succeeded/failed at time T" exists anywhere.
- **Duplicate-execution handling**: two concurrent invocations would each
  create their own timestamped directory (collision-safe by construction —
  the timestamp is millisecond-resolution) but would also each independently
  hit `supabase db dump`, which is wasteful but not unsafe.
- **Partial-backup handling**: `runDump()` already exits non-zero on any
  `spawnSync` failure, which is a genuine, existing safeguard against
  silently treating a partial dump as complete — this one property already
  meets a production-automation bar; the rest above do not.

## 20. Restore verification strategy (design for a future repeatable drill)

A future, periodic restore drill (frequency itself gated on the still-open
RPO/RTO decision) should cover, in this order, building directly on what
§6.3/§8 already exercises locally:

- **Database**: tables/indexes/functions/RLS/policies/domain-data counts —
  already scripted informally this task (§6.3); should be formalized into a
  repeatable checklist or script, not re-invented ad hoc each time.
- **Auth**: users, identity configuration, provider configuration
  (redirect URLs, email templates, MFA settings), and any Auth-adjacent
  operational secrets — **only meaningful against a managed
  restore-to-new-project target** (§9's comparison table); the logical-dump
  path never restores any of this by design and should not be drilled
  against it.
- **Realtime**: confirm the `supabase_realtime` publication exists and
  contains the expected tables (`leave_requests`, `notifications`,
  `leave_approval_events`); confirm channel-level RLS still gates access
  correctly (reuse §8's actor-level testing pattern).
- **Migration history**: confirm `supabase_migrations.schema_migrations`
  reflects every applied migration; if reconciling a gap, use `supabase
  migration repair` to mark versions as applied **without re-running them**
  (§6.4) — never blindly re-run `supabase db push` against a restored
  target without first confirming, object-by-object, that a migration is
  already reflected in the schema.
- **Storage**: not applicable today (§10 — unused); if adopted later, a
  drill must separately verify buckets, objects, policies, and any external
  dependency, since Supabase documents Storage as excluded from database
  backups/restores regardless of mechanism.
- **Application**: Fastify startup, database connection, `/healthz`,
  `/readyz`, authentication (requires a real Supabase-provisioned target —
  see §12's identified gap), leave read/create/decision paths, notification
  infrastructure, and pg-boss startup — **none of this was exercised this
  task** (§12's recorded gap); a genuine future drill should include it,
  most feasibly against a managed restore-to-new-project target where a
  real `auth`/JWKS surface exists for `apps/api` to authenticate against.

This section is a design for a *repeatable* drill procedure, not a report of
one having been run — no destructive restore operation was performed against
staging or production by this task, matching its explicit instruction.

## 21. Capability matrix — logical dump vs. managed restore vs. PITR

| Capability | Logical dump (`backup.mjs` + §6.2) | Managed Supabase restore (restore-to-new-project) | PITR |
|---|---|---|---|
| DB schema/data | Yes, with the named 10-policy gap on a bare (non-Supabase) target (§6.4); full fidelity on a genuinely Supabase-provisioned target | Yes | Yes |
| DB roles/permissions | Partial — `authenticated`/`anon`/`service_role` roles themselves are platform-provisioned, not part of a `public`-schema dump; grants on DigiHostel's own objects restore correctly | Yes | Yes |
| Auth users | No (§6.4/§9 — 7 distinct `relation does not exist` errors, confirmed empirically) | Yes (Supabase's own documented behavior) | Yes (continuous, by construction) |
| Auth configuration (providers, redirect URLs, MFA, email templates) | No | **Requires manual reconfiguration even on the managed path**, per Supabase's own documentation (§9) | Same as managed restore — PITR restores data, not platform configuration |
| Realtime publication/config | No — publication object itself absent post-restore (§6.4/§8, confirmed empirically) | Not verified by this task — Supabase's own documentation notes Realtime settings may need reactivating even after a managed restore | Same caveat as managed restore |
| Storage objects | No (not applicable today — §10) | No — Supabase documents Storage objects as excluded from database backups/restores | No — same exclusion |
| Storage configuration | No | Requires manual reconfiguration, per Supabase documentation | Same |
| Migration history (`supabase_migrations`) | No (§6.4, confirmed empirically — schema absent post-restore) | Not independently verified this task | Not independently verified this task |
| Point-in-time selection | No — single moment only (whenever the dump was taken) | No — restores to the backup's own fixed point | **Yes — this is PITR's defining capability** |
| Off-site downloadable artifact | **Yes** — `schema.sql`/`data.sql` are ordinary files an operator fully controls | No — restore happens within Supabase's own infrastructure | No — same |

Only capabilities directly confirmed by this repository's own empirical
testing (§6.4/§8) or Supabase's own documented behavior are marked
Yes/No/Partial above — no cell states a capability neither source supports.

## 22. Production DR recommendation — ACCEPTED 2026-09-08 (Product Owner decision)

**History**: this section previously (2026-09-07) recommended Option D
(Hybrid-without-PITR) as the production target and treated PITR as an
RPO-gated future upgrade; that was corrected the same day to Option E
(Hybrid + PITR) once independent review found it inconsistent with the
SDD's unqualified PITR requirement (§2, §18). At that point the specific
RPO/RTO/PITR-retention numbers remained an open product decision with no
established authority to supply them. **The Product Owner has now
(2026-09-08) explicitly supplied that decision** — see
[`ADR-022`](../adr/ADR-022-production-backup-dr-strategy.md)'s "Product
Owner Decision" and "Decision authority" sections for the full record.

**Interim staging DR posture (today, non-production)**: staging remains on
the Free plan, so neither managed backups nor PITR are available on it at
all — the only mitigating practice available is the manual logical-backup
script (Option C), currently unscheduled. This is an accepted limitation of
a pre-launch staging environment, not a claim of SDD compliance, and is not
the environment the SDD's backup/PITR requirement is evaluated against.

**Target production DR architecture (ACCEPTED, required for SDD
compliance)**: Option E — Hybrid + PITR at **7-day retention** (Pro-tier
managed daily backups **+ PITR enabled at 7 days** + continued,
eventually-scheduled use of the existing logical-backup script), per
ADR-022 (**ACCEPTED 2026-09-08**). This is the only option among those
evaluated that satisfies every element of the SDD's stated requirement
(§2, §18): automated daily backups, PITR, and — via the independent
logical half — protection against a platform-account-level incident that
daily-backups-and-PITR alone cannot cover (both live inside the same
Supabase account).

> **Product Owner approved (2026-09-08)**: RPO = 1 hour, RTO = 1–4 hours,
> PITR retention = 7 days, plus a qualitative scale-up review trigger
> (revisit when DigiHostel materially scales or its operational
> criticality changes — no numeric threshold invented). **Approved
> architecture target, not yet operationally verified** — see §7's
> "Approved target vs. verified capability."

**Explicitly deferred, not resolved by this acceptance**: the off-site
storage destination and encryption approach for the logical-backup half's
output (§16's open decision), the specific scheduler mechanism (§19),
provisioning the production Supabase project itself, purchasing/enabling
the approved 7-day PITR tier, and demonstrating the approved RPO/RTO
through an actual restore drill (§20) — none of these has been done; this
section records an accepted decision, not a completed implementation.

## 23. Free-tier-first implementation policy (2026-09-08)

**Policy**: DigiHostel is designed and implemented to operate within the
Supabase **Free** tier during the current development, testing, and
staging phase. The current Free tier is the **active implementation
baseline** — not a temporary accident, and not evidence that the approved
production DR target (ADR-022) has been weakened or cancelled. The future
paid environment (Pro + 7-day PITR) is a **scale-up target**, reached when
the Product Owner's already-approved qualitative trigger (§27) is met —
not the environment this repository currently builds against.

| | Current | Future |
|---|---|---|
| Supabase plan | **Free** | **Pro** |
| PITR | Not available on this plan | **7-day retention** — a **separate add-on** on top of Pro, not bundled into the base subscription (ADR-022, Product Owner-approved 2026-09-08; see §27's "PITR classification") |
| Managed daily backups | Not included | Included with the Pro base subscription |
| Status | Active implementation baseline | Scale-up target, reached via the approved trigger |

**Critical distinction, not to be blurred**:

- **Free-tier compatibility** (current constraint): the application
  architecture must be capable of running within current Free-tier limits
  for development, integration testing, staging, and pilot preparation
  where operationally appropriate.
- **Production DR target** (future capability, unchanged from ADR-022):
  managed daily backups, PITR at 7-day retention, RPO = 1 hour, RTO = 1–4
  hours. These require moving to the appropriate paid Supabase
  configuration — they are **not** achievable on Free, and this policy
  does not claim otherwise.

**Free-tier operation is the current implementation constraint; Pro + PITR
is the future production/scale-up capability target.** Neither statement
weakens the other.

## 24. Supabase Free-tier baseline

The figures below were supplied as the current operative baseline for this
policy. **Evidence caveat**: this session's `WebFetch`/`WebSearch` tooling
was unavailable (backend model error) when this section was written, so
these figures are **not independently re-verified against a live fetch of
supabase.com/pricing this session** — unlike the PITR add-on pricing
elsewhere in this runbook and in ADR-022, which *was* verified live via the
Management API. Reconfirm against Supabase's current pricing page before
any production sizing decision that depends on precise values.

| Capability | Free baseline |
|---|---:|
| Database size | 500 MB |
| Storage | 1 GB |
| Egress | 5 GB |
| Cached egress | 5 GB |
| Monthly active users | 50,000 |
| Realtime peak connections | 200 |
| Realtime messages | 2 million/month |
| Edge Function invocations | 500,000 |
| Edge Function wall-clock limit | 150 seconds |
| Active Free projects | 2 |
| Project pausing | After 1 week of inactivity |
| Managed automatic backups | Not included |
| PITR | Not included |
| Log retention | 1 day |
| Maximum file upload size | 50 MB |
| Realtime max message size | 256 KB |

These are **platform constraints**, not product requirements — they are
not hard-coded into application logic anywhere in this repository, and
this section does not introduce any such hard-coding.

## 25. Free-tier architectural constraints (reviewed 2026-09-08)

DigiHostel's architecture was reviewed against this baseline. The
already-accepted architecture does **not** depend on any of the following
during the current development/staging phase, and none was found to be
incorrectly documented as currently available:

- PITR — already correctly documented throughout this runbook and
  ADR-022 as unavailable on the current plan (§3, §11).
- Managed daily backups — already correctly documented as absent
  (`backups: []`, §3).
- Custom domains — not configured anywhere (`docs/runbooks/production-deployment.md`
  confirms no custom domain exists for the also-nonexistent production
  environment).
- Log Drains — `docs/observability.md` already correctly states "Log
  Drains require Pro/Team/Enterprise, not purchased here."
- Read replicas — not referenced anywhere in this repository's
  architecture or ADRs; no dependency exists.
- Advanced compute — staging runs on Free-tier shared compute (§3); no
  documentation claims otherwise.
- Paid-only monitoring — observability (`docs/observability.md`) already
  uses pino structured logging and Supabase/Render's native free-tier
  dashboards, explicitly deferring Sentry/APM per ADR-013's own
  documented scope.
- Paid-only Storage/Realtime capacity — DigiHostel currently has no
  Storage usage at all (§10) and Realtime usage (three tables in the
  `supabase_realtime` publication, verified end-to-end in F-08) is far
  below the Free-tier connection/message limits at current pilot-hostel
  scale.

**No existing documentation was found stating that any of these paid-only
capabilities is currently available** — the architecture was already
Free-tier-compatible before this task; this section formalizes that as an
explicit, reviewed policy rather than an implicit accident. No application
architecture change was made or was needed.

### Database design under Free (500 MB quota)

Practical design rules already consistent with the existing architecture:
bounded pagination (already used in the Approval History module's incremental
list rendering, `apps/parent-mobile/docs/approval-history.md`), avoiding
unbounded result sets, avoiding unnecessary duplicate data, avoiding large
binary payloads in Postgres (no BYTEA/large-object usage exists in the
current schema), retaining only required audit data per the eventual
retention policy, using appropriate indexes (58 indexes already exist,
`docs/rls-policy-matrix.md`), and monitoring database growth. **No numeric
database-growth threshold is invented here** — the current staging database
measures 14 MB (§11, verified 2026-09-07), far below the 500 MB quota, and
no schema redesign is warranted merely to pre-optimize for a limit not
currently approached. If the eventual data model cannot remain safely
within Free-tier limits, that is exactly the scale-up trigger's job to
catch (§27) — not a reason to delete required audit/security data now.

### Storage design under Free (1 GB quota)

DigiHostel has no current Supabase Storage usage (§10) — `getStorageBucket()`
in `apps/parent-mobile/src/services/supabase/storage.ts` is unused scaffold.
Large files/media should not be assumed to fit indefinitely within 1 GB if
a future feature adopts Storage. No alternative storage provider is
introduced by this task, and no image-transformation dependency (a
paid-tier Supabase Storage feature) is added merely because it exists on
Pro. At scale-up, evaluate 100 GB Pro Storage, Smart CDN, image
transformations, and higher upload limits (§27) — not before.

### Realtime design under Free (200 connections / 2M messages per month)

The already-accepted architecture (ADR-009, Supabase Realtime — Postgres
Changes via the `supabase_realtime` publication, verified in F-08) is
unchanged by this policy. DigiHostel's current pilot-hostel scale is far
below 200 concurrent connections or 2 million messages/month — no
artificial connection pooling or other complexity is introduced to hide or
manage this quota, since there is nothing currently approaching it. Future
Pro capacity (500 peak connections, 5 million messages/month, §27) is
documented as a scale-up option, not implemented now.

### Edge Functions

ADR-021's Fastify + pg-boss persistent-process runtime remains
authoritative and unchanged — no DigiHostel backend functionality is
redesigned around Supabase Edge Functions by this task. Current Free
capacity (500,000 invocations, 150-second wall-clock limit) is documented
for completeness; DigiHostel does not currently use Edge Functions at all
(confirmed — no `supabase/functions/` directory exists, §10), so this
limit is not currently a binding constraint on anything. Future Pro
increases invocation quota and execution duration — not evaluated further
here, since no current or planned use of Edge Functions exists to size
against it.

### Authentication

Supabase Auth (ADR-014) remains the accepted identity/authentication
provider, unchanged and unweakened by this policy. Current Auth usage
(OTP-based parent authentication, F-02's eligibility-gate remediation) is
far below the 50,000 MAU Free-tier limit at pilot-hostel scale. No
paid-only authentication feature (e.g. Advanced MFA) is added now. At
scale-up, review MAU growth, OTP volume, abuse/rate-limit requirements,
authentication observability, and advanced MFA requirements if needed
(§27) — not before.

## 26. DR interpretation — Free-tier capability vs. the approved production target

**The current Free tier does NOT satisfy the final production DR
architecture approved in ADR-022. This is not a new finding — F-04's own
prior work already established this (§3, §11) — this section makes the
distinction explicit and central, not merely incidental.**

**Current Free environment can provide**:
- Logical CLI backups (`supabase/scripts/backup.mjs`, verified working,
  §6.2/§8).
- Isolated restore testing (verified this task series against a disposable
  local database, §6.2–§6.4/§8).
- Backup validation (checksum computation, schema/data comparison, §12).
- Manual recovery procedures (documented, §6).
- DR rehearsal (genuine actor-level RLS testing performed, §8).
- Documentation (this runbook).
- Restore evidence (§8's full test record).

**Current Free environment cannot provide**:
- Supabase-managed daily backups (`backups: []`, confirmed via API, §3).
- PITR (`pitr_enabled: false`, confirmed via API, §3/§11).
- The approved production 1-hour RPO as a **guarantee** — a manually-run,
  unscheduled logical export cannot operationally promise a 1-hour data-loss
  window (§7.1's "operationally guaranteed RPO" analysis).

**Future paid environment target (ADR-022, unchanged by this policy)**:
Supabase Pro, managed daily backups, PITR at 7-day retention, approved RPO
= 1 hour, approved RTO = 1–4 hours, independent logical/off-site backups
retained as defense-in-depth alongside (not replaced by) the managed
mechanisms.

**This runbook does not claim the Free tier satisfies the approved
production DR target, at any point.** Every DR verification performed
against the current Free-tier staging project (§6–§14) is explicitly
scoped as **local/staging verification of the DigiHostel-owned schema and
data**, not as evidence of production-grade RPO/RTO compliance.

## 27. Paid-tier transition plan (future — not performed now)

**Trigger (already approved, ADR-022 — unchanged, no numeric threshold
invented here or elsewhere)**: DR requirements must be reviewed when
DigiHostel **materially scales or its operational/data-criticality
requirements change**.

**At that review, the Product Owner must explicitly reconsider**: RPO,
RTO, PITR retention, database capacity, storage capacity, egress, MAU,
Realtime connections, Realtime message volume, logs/observability, backup
strategy, restore frequency, authentication volume, support requirements,
security/compliance requirements, and cost.

### Supabase migration path (future)

Free → Pro → separately evaluate/enable the 7-day PITR **add-on** (PITR is
never bundled into the Pro base subscription — see "PITR classification"
below). The migration must preserve schema, data, RLS, Auth, Realtime, API
connectivity, migration history, and audit data. **Not performed by this
task** — no plan upgrade, no PITR enablement, no production project
creation.

### Included with the Pro base subscription (evaluate at scale-up, not integrated now)

| Capability | Free | Pro (included) |
|---|---:|---:|
| Database capacity | 500 MB | 8 GB included |
| Storage | 1 GB | 100 GB included |
| Egress | 5 GB | 250 GB included |
| Cached egress | 5 GB | 250 GB included |
| Monthly active users | 50,000 | 100,000 |
| Realtime peak connections | 200 | 500 |
| Realtime messages/month | 2 million | 5 million |
| Edge Function invocations | 500,000 | 2 million |
| Managed daily backups | Not included | Included (rolling, not PITR — see below) |
| Log retention | 1 day | 7 days |
| Support | Community | Email support |
| Project pausing | After 1 week of inactivity | Projects do not pause on Pro |

**Do not automatically enable every capability merely because it becomes
available at Pro** — each is evaluated against a concrete requirement at
scale-up time ("evaluate and integrate when justified by scale or
operational requirements"), not integrated wholesale. Of everything in this
table, only **Pro-level managed daily backups** is a currently approved
future production requirement (alongside PITR and the approved RPO/RTO,
below) — the rest remain future evaluation items, not automatic adoptions.

### PITR classification — corrected: a separate add-on, not part of the Pro base subscription

**PITR is a separate project add-on on Pro, not bundled into the $25/month
Pro base subscription.** Enabling PITR requires the project to already be
on Pro *and* purchasing the PITR add-on separately, at a retention tier of
the operator's choosing (7/14/28 days).

- **DigiHostel's future production target**: Pro + the **7-day PITR
  add-on** (Product Owner-approved retention, ADR-022 — unchanged by this
  correction).
- **Current documented price for the 7-day PITR add-on**: **approximately
  $100/month** — this figure is independently corroborated by this
  session's own live Management API query against this project's real
  billing-addons catalog (`GET /v1/projects/{ref}/billing/addons`,
  2026-09-07, E1 evidence, unaffected by this task's tooling limitations
  below).
- **This is not a permanent price guarantee.** Supabase's pricing can
  change. **Pricing must be re-verified immediately before the production
  scale-up decision** — do not act on the $100/month figure above without
  reconfirming it at that time.

### Separate project add-ons (not included in the base Pro subscription; not purchased now)

PITR, additional Compute, Read Replicas, advanced disk configuration, Log
Drains, Custom Domains, IPv4, Advanced MFA, Pipelines. **None of these is
included in the $25/month Pro base subscription** — each is a distinct,
separately-priced add-on. Only PITR (at the approved 7-day tier) is a
currently approved future production requirement; the rest remain future
evaluation items, integrated only when justified by scale or operational
requirements.

### Free-tier backup strategy (interim, until scale-up)

During the Free-tier phase, **Supabase CLI logical exports
(`supabase/scripts/backup.mjs`) are the available backup mechanism** — this
does not change what §19 already documents as missing for production-grade
automation (scheduler, off-site upload, retention cleanup, alerting). The
backup strategy must remain: run manually or scheduled externally where
already supported, validated (checksum + restore test, §12), kept outside
Git (`supabase/.gitignore`, verified, §14), protected from accidental
exposure, tested through isolated restore (§6.2–§6.4), and documented
(this runbook). **No new cloud storage integration was created by this
task** — if scheduling requires an external service not already approved,
that remains a future operational decision (§16's existing open gap), not
resolved here.

> **Mandatory future reminder**: Before DigiHostel scales materially or
> moves toward production at larger scale, the Product Owner must
> explicitly review the Free-tier limits above and approve migration to
> the appropriate paid Supabase tier. That review must explicitly
> reconsider the approved RPO, the approved RTO, PITR retention, all
> newly available paid-tier capabilities, and which capabilities should
> actually be integrated into the application/operations. **This runbook
> does not authorize a silent plan upgrade or silent enablement of any
> paid capability** — every one of them requires the explicit review above.

## 28. Open gaps (explicit, not silently resolved)

- **DR-tooling fragility, still worth tracking (found 2026-09-08)**: both
  of this repository's DR verification paths (`supabase db dump --linked`,
  and local restore testing via the local Supabase Docker stack) share a
  single hard dependency on Docker Desktop being operational on whichever
  machine runs them. A same-day rehearsal attempt was initially blocked
  when Docker Desktop's backend failed to start (`docker-desktop` WSL2
  distro stuck `Stopped`); once Docker was brought up, the rehearsal was
  re-run immediately and completed successfully in full (§8's 2026-09-08
  entry) — the underlying DR mechanism was never in question, only the
  availability of the tooling needed to exercise it on this particular
  machine at that particular moment. Worth considering a more resilient
  rehearsal environment (e.g. a CI runner with Docker pre-provisioned) for
  future rehearsals, not resolved here.
- **Free-tier baseline figures (§24) were not independently re-verified via
  a live fetch of Supabase's pricing documentation this session** — this
  session's `WebFetch`/`WebSearch` tooling encountered a backend error.
  Reconfirm against `supabase.com/pricing` before any production sizing
  decision that depends on precise Free/Pro numeric limits (the PITR
  add-on pricing elsewhere in this runbook and in ADR-022 *was* verified
  live via the Management API and is unaffected by this gap).
- **RESOLVED 2026-09-08**: RPO (1 hour), RTO (1–4 hours), PITR retention
  (7 days), and decision authority (Product Owner) are now all explicitly
  approved — see §7/§18/§22 above and
  [`ADR-022`](../adr/ADR-022-production-backup-dr-strategy.md) (**ACCEPTED**).
  A scale-up review trigger (qualitative — material scale/criticality
  change) requires revisiting all three later. **These are approved
  architecture targets, not yet operationally verified capabilities** — see
  the remaining bullets below for exactly what is still outstanding.
- **Historical record, preserved**: a 2026-09-07 decision-authority review
  found that `CLAUDE.md`, `workflow.md`, `docs/adr/README.md`,
  `docs/decision-log.md`, and `docs/implementation-baseline.md` named no
  person, role, or process authorized to decide RPO/RTO/PITR-retention or
  accept ADR-022 (a genuine governance gap, distinct from the numeric
  decision itself). An earlier same-day revision of ADR-022 and this
  runbook had also, before that, incorrectly treated PITR adoption itself
  as gated on a missing numeric RPO. Both gaps are now closed — the
  authority gap by explicit Product Owner instruction (2026-09-08)
  establishing that role for this decision, and the numeric gap by the
  values the Product Owner then supplied. See ADR-022's "Decision
  authority" section for the full before/after record — left here,
  unresolved-sounding language and all, so the correction remains
  traceable rather than silently overwritten.
- The Pro-tier base subscription price used in §18/ADR-022's cost analysis
  is E2 (Supabase's published pricing page), not independently re-verified
  via this session's Management API access (org-level billing endpoints
  were unreachable with this task's PAT scope) — worth a direct
  confirmation before any purchase decision.
- No production Supabase project exists yet — backup/PITR cannot be enabled
  or verified against production until one does (§3).
- **The staging project currently has zero backup coverage of any kind**
  (`backups: []`, `pitr_enabled: false`, §3/§11/§14) — deleting or
  corrupting it today has no platform-level fallback; the only recovery
  path is a manually-run, unscheduled logical export.
- **The approved RPO (1 hour) and RTO (1–4 hours) have not been
  operationally demonstrated** by any test performed so far — a future,
  authorized restore drill against a production-representative target
  (§20) is required before this runbook can certify the system actually
  meets them, as distinct from having a target to build toward (§7).
- No automated (scheduled/CI) backup job exists — `supabase/scripts/backup.mjs`
  is a manually-invoked tool, not a cron/CI job; scheduling it is deployment
  infrastructure, out of this task's scope.
- PITR is unavailable on the current (Free) plan and has not been enabled
  or live-verified (§11) — a genuine, tracked pre-production requirement.
- A managed Supabase "restore to new project" drill has never been
  exercised against a genuinely disposable Supabase project (§9) — only
  the manual logical-dump path has been tested, and only locally.
- An end-to-end `apps/api` application-level smoke check against a
  restored database (does the API actually start and answer `/healthz`)
  has not been performed against any restored target (§12) — only
  structural/RLS-level restore verification has been done.
- pg-boss's own recovery behavior across a full database restore has not
  been tested end-to-end (only F-03's crash/redelivery scenarios, which
  assume the database stays up).
- `supabase migration repair` (the documented remediation for the
  migration-history gap, §6.4) has never been exercised — no genuinely
  restored remote target has existed this task to apply it to.
