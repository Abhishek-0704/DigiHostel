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

The SDD specifies (verbatim, `sdd/Chapter_12_Database_Design_and_Data_Model_SDD.docx`
§12.7, `sdd/Chapter_16_Operations_Maintenance_and_Support_SDD.docx` §16.7):

> "Automated daily backups, point-in-time recovery, periodic restore
> testing, and archival of historical audit data."
> "Daily backups, PITR, restore drills, documented runbooks."

**No accepted ADR and no SDD chapter specifies a numeric RPO, RTO, retention
period, or PITR window.** Per `docs/adr/README.md`'s source-of-truth
hierarchy, this is a genuine, unfilled requirement gap, not something this
runbook may invent. See §7 ("RPO/RTO") for the explicit
`REQUIREMENT NOT SPECIFIED` record and the minimum decision needed before
this can be certified against a formal target.

## 3. Current production state (as of this writing)

**There is no production Supabase project for DigiHostel.** Verified via the
Supabase CLI's own authenticated `projects list` (this machine's CLI session
belongs to an organization whose only project is `YatraSync` — a separate,
unrelated project that must never be treated as, or confused with,
DigiHostel's data). `docs/current-state.md` and `docs/adr/ADR-013-deployment-architecture.md`
independently confirm no deployment pipeline or hosted project exists yet
(`apps/api`/`apps/parent-mobile` run only against a local Supabase Docker
stack in every environment this repository has been developed in).

Consequently: **managed daily backups and PITR cannot be enabled, verified,
or tested against production, because there is no production database to
enable them on.** This is not an access/credentials problem — it is a
pre-deployment prerequisite gap, tracked separately under deployment
readiness (out of this task's scope; see `docs/current-state.md`'s "No
deployment infrastructure" note).

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
**database recovery**, not complete recovery. Confirmed empirically (§8):
restoring a logical `public`-schema dump into a database that was not
originally provisioned by Supabase (i.e. lacks the `auth`, `storage`,
`vault`, `extensions` schemas and the `supabase_realtime` publication) loses:

- every RLS policy that calls `auth.uid()`/`auth.role()` (self-ownership
  checks — 10 of this schema's 66 policies, empirically),
- the foreign-key constraints tying `students`/`parents`/`staff` to
  `auth.users` (3 constraints),
- Supabase Auth's own user/session/identity data (never included in a
  `public`-schema dump by design — it is platform-owned, not
  application-owned).

**Complete platform recovery** additionally requires the target to already
be (or become) a real Supabase-provisioned project — either the original
project restored via its own managed backup/PITR, or a genuinely new project
that Supabase's own provisioning has bootstrapped with `auth`/`storage`/etc.
before the logical restore runs. See §9 for the full list of what a database
restore alone does not recover.

## 7. RPO / RTO

- **Required RPO**: `REQUIREMENT NOT SPECIFIED` — the SDD requires PITR
  ("point-in-time recovery... fine-grained time resolution") but names no
  numeric target. **Minimum decision needed before production approval**:
  the product/engineering owner must state an acceptable maximum data-loss
  window (e.g. "≤15 minutes") so a specific Supabase plan/PITR retention can
  be selected against it.
- **Achievable RPO today**: not applicable — no production backup/PITR
  exists to measure.
- **Required RTO**: `REQUIREMENT NOT SPECIFIED` — no SDD/ADR text names a
  target recovery time.
- **Observed local restore duration** (§8): schema + data restore into an
  isolated local database completed in **under 5 seconds** for this
  repository's current (seed-scale) dataset. This number is **not**
  representative of a production restore (managed backup/PITR restores at
  cloud scale take materially longer, and this figure excludes the
  platform-schema bootstrap gap documented in §6.4) and must not be quoted
  as a production RTO estimate.
- **PASS/FAIL/NOT SPECIFIED**: NOT SPECIFIED for both RPO and RTO.

## 8. Last tested

- **Test date**: 2026-09-05
- **Environment**: local Supabase Docker stack (`supabase_db_DigiHostel`
  container), this repository's own dev environment — **not** production
  (none exists).
- **Recovery mechanism tested**: logical backup/restore (`supabase db dump
  --local` → `psql` restore into a freshly created, isolated database on the
  same local Postgres server, never overwriting the original dev database).
- **Backup/recovery point**: the local dev database's live state at test
  time (seed data + accumulated test-fixture rows).
- **Restore start**: 2026-09-05T17:35:46Z
- **Restore completion**: 2026-09-05T17:35:49Z (schema + data, ~3s total)
- **Result**: **Database-level restore succeeded for DigiHostel's own
  schema and data** — all 17 tables, all 58 indexes, all 8 functions, and
  every domain table's row count (students, parents,
  parent_student_relationships, trusted_devices, leave_requests,
  leave_approval_events, audit_logs, staff, hostels) matched the source
  exactly. **56 of 66 RLS policies restored**; the 10 missing policies and 3
  missing foreign-key constraints are exactly the `auth.users`-dependent
  ones, per the platform-schema gap in §6.4 — not a defect in the backup
  itself, but a genuine limitation of a bare-database logical restore that
  this runbook now documents from direct evidence rather than assumption.
  Test artifacts (dump files, the isolated test database) were deleted
  immediately after verification.
- **PITR/managed-backup restore**: **NOT PERFORMED** — no production
  project exists to test it against (§3).

## 9. Application recovery implications

A database restore is not a complete application restore. Status of each
additional component, as verified in this repository today:

| Component | Status | Notes |
|---|---|---|
| Supabase Auth (users/sessions/identities) | **Not applicable to a `public`-schema logical restore** | Platform-owned; only recovered via Supabase's own project-level backup/PITR or a fresh sign-up/re-authentication flow |
| API (`apps/api`) environment variables/secrets | **Manually reconfigured** | `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`DATABASE_URL` etc. are process env vars, never stored in the database — must be re-pointed at the recovered project by whoever operates the deployment |
| Realtime (`supabase_realtime` publication) | **Manually reconfigured** | Confirmed empirically: the publication itself failed to restore into a bare database (§6.4); a real project restore must re-verify it exists (`supabase/migrations/0002_realtime_publication.sql`) |
| pg-boss scheduled jobs (escalation/notification queue) | **Not yet verified** | pg-boss's own internal tables (`pgboss.*`) are not part of DigiHostel's `public`-schema domain dump scope tested here; a real recovery must confirm pg-boss re-initializes its schema and any in-flight jobs are handled per `apps/api/src/workers/`'s own crash-recovery design (F-03), not assumed recovered by this runbook |
| Push notification (Expo) configuration | **Not applicable** | No real push credentials exist in this repository yet (`docs/current-state.md`) |
| EAS / Expo mobile build configuration | **Not applicable to database recovery** | Independent of database state |
| Vercel/API deployment configuration | **Not yet verified** | No deployment pipeline exists yet (ADR-013's scaffolding is not yet operational) |
| Domain / external provider configuration | **Not applicable** | None configured yet |
| Storage objects | **Not applicable** | No Storage usage exists in this schema today |

## 10. Rollback / containment

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

## 11. Off-site logical backup

`supabase/scripts/backup.mjs` (added by this remediation) wraps `supabase db
dump` for both `local` and `linked` targets. It embeds no credentials —
`--linked` relies entirely on the Supabase CLI's own `supabase link` state.
Output is written to `supabase/backups/`, which is git-ignored; operators
are responsible for moving a real backup to actually-durable, access-controlled
storage outside this working directory (this script only produces the file,
it does not itself implement off-site storage/retention — that is a
deployment/infrastructure decision, out of this task's scope per its own
"do not implement deployment" instruction).

## 12. Open gaps (explicit, not silently resolved)

- No production Supabase project exists yet — backup/PITR cannot be enabled
  or verified against production until one does (§3).
- RPO and RTO targets are unspecified by the SDD/ADRs — a numeric decision
  is required before this runbook's recovery guarantees can be certified
  (§7).
- No automated (scheduled/CI) backup job exists — `supabase/scripts/backup.mjs`
  is a manually-invoked tool, not a cron/CI job; scheduling it is deployment
  infrastructure, out of this task's scope.
- pg-boss's own recovery behavior across a full database restore has not
  been tested end-to-end (only F-03's crash/redelivery scenarios, which
  assume the database stays up).
