# Production Deployment Runbook — DigiHostel

F-06 remediation (PRR Phase 13), updated by F-06A (2026-09-06, ADR-021 —
API + pg-boss worker runtime hosting decision), then by F-06's own
implementation phase (2026-09-06, same day — the persistent-host Docker
image, health/readiness endpoints, and graceful-shutdown hardening this
document now describes as built and verified). Documents the authoritative
deployment architecture, what has actually been built/verified, and what
remains an external prerequisite. Labels used throughout, per this task's
own required convention:

- **VERIFIED** — actually executed/confirmed working in this environment.
- **CONFIGURED BUT UNVERIFIED** — repository-side configuration exists but
  has not been exercised against a real external environment.
- **EXTERNAL PREREQUISITE** — requires an external resource/decision this
  task is not authorized to create/make.
- **NOT IMPLEMENTED** — does not exist yet.
- **IMPLEMENTED IN REPOSITORY** — the code/configuration exists and has been
  verified locally (including, where noted, inside a real Linux container),
  but has not been deployed to any external environment.
- **DEPLOYED TO STAGING** / **DEPLOYED TO PRODUCTION** — actually running on
  a real external environment.

**Update (QG-06 production infrastructure + F-QG06-11 remediation, 2026-09-23/24).**
The "no staging or production environment exists yet" framing above is now
historical, not current. Real, separate production infrastructure exists and
is live: Vercel Production (`digihostel-reception-dashboard.vercel.app`) →
Render Production (`digihostel-api-production`, service id
`srv-daq145mk1f9s73dj3oeg`) → Supabase Production (`asphlfoikqyaeslmhrah`,
`ap-southeast-2`). All 26 committed migrations are applied, 27/27 public
tables have RLS enabled, and the `supabase_realtime` publication is
populated identically to staging. **DEPLOYED TO PRODUCTION now applies** to
the current `apps/api`/`apps/reception-dashboard` revision as of commit
`75dcc49d7a14c5209661db293882b10b062ae451`. A repeatable, repository-defined
CI deployment workflow (`.github/workflows/deploy-production.yml`) now
exists closing F-QG06-11 — see the updated §9/§13/§14/§15/§18 below. Two
items from the original audit remain genuinely unresolved and are **not**
addressed by this update: production PITR/backups (F-QG06-01, an
account-owner billing decision) and a production administrator account
(F-QG06-09, an account-owner action per this project's standing prohibition
on autonomous account creation).

**Update (2026-09-24):** F-QG06-09 is since **CLOSED** — a real production
administrator was provisioned via the certified Supabase Auth + `staff`
row mechanism, with password authentication, native TOTP MFA, AAL2, RBAC,
and Force Sign-Out all independently verified live against production, the
last including database-level confirmation. F-QG06-01 remains open — the
account owner has since explicitly decided to defer Supabase Pro/PITR
adoption, formally recorded as a governed risk acceptance in
[ADR-026](../adr/ADR-026-interim-production-recovery-risk-acceptance.md)
(ACCEPTED, partially superseding ADR-022) rather than left as an
undocumented gap. Current status: **F-QG06-01 — TECHNICALLY UNRESOLVED —
RISK ACCEPTED / DEFERRED**, not closed.

## 1. Prerequisites

- GitHub repository access with permission to configure Actions secrets and
  branch protection (`EXTERNAL PREREQUISITE` for anyone other than the repo
  owner — see §6 "GitHub" for this repo's current actual state).
- A production Supabase project — **satisfied** (`asphlfoikqyaeslmhrah`,
  2026-09-23/24; see the top-of-file update note and §9/§13).
- A Render account/service for `apps/api` (§3) — **satisfied**
  (`digihostel-api-production`, `srv-daq145mk1f9s73dj3oeg`; created via a
  direct API call, not `render.yaml`'s Blueprint flow — see §9).
- An Expo/EAS account and project (`EXTERNAL PREREQUISITE`).

## 2. Environment Model

```
LOCAL  →  CI (GitHub Actions, every PR)  →  STAGING  →  PRODUCTION
```

- **LOCAL**: this repository's existing local Supabase Docker stack +
  `apps/api` run directly with `pnpm --filter @digihostel/api run dev`.
  **VERIFIED** (this is how every prior remediation phase in this
  repository's history has run and tested against a real local instance).
- **CI**: `.github/workflows/ci.yml` — checkout, typecheck, lint, format, a
  fresh local Supabase instance, pgTAP, the full test suite (including
  real-Postgres integration tests, not skipped), and a full build, plus a
  `deploy-api` job (§7). **CONFIGURED, every step replicated locally in the
  exact order the workflow specifies (§7) — not yet exercised as an actual
  GitHub Actions run**, since this task does not push/commit without
  explicit instruction.
- **STAGING**: The SDD does not mandate a dedicated, persistent staging
  service beyond "Development / Staging / Production" (SDD Ch.14 §14.3,
  naming only, no infrastructure detail). Recommended representation: a
  **second Supabase project** (or Supabase branching, if available on the
  chosen plan) for a staging database, plus a second Render service (or the
  same service's preview-environment feature, if used) for the API, and an
  EAS **preview** build profile (already added, `apps/parent-mobile/eas.json`)
  for mobile. **NOT IMPLEMENTED** — no staging Supabase project or API
  staging deployment exists yet; this remains a recommendation, not
  something provisioned by any task so far.
- **PRODUCTION**: Supabase project and Render service now exist and are
  live (2026-09-23/24 — see the top-of-file update note); EAS production
  build remains `EXTERNAL PREREQUISITE`, unaffected by this update.

**ARCHITECTURE DECIDED (ADR-021, F-06A, 2026-09-06); a concrete hosting
target has since been implemented in the repository (F-06, same day):**
F-06's audit found that ADR-013 selects Vercel for backend hosting while
ADR-011 (accepted) has `apps/api` run its HTTP server (Fastify
`app.listen(...)`) and its pg-boss background workers
(`startBackgroundWorkers()` — the escalation scheduler, notification
delivery worker, and F-03's notification reaper) **in the same long-lived
Node process** (`apps/api/src/index.ts`) — a shape Vercel's serverless
execution model cannot host. A dedicated follow-up task (F-06A) evaluated
three options and decided: **a single persistent-process host for both the
API and the workers, exactly as already implemented — not Vercel, not a
rearchitecture** (ADR-021, partially superseding ADR-013's backend-hosting
clause only).

**Implementation status: IMPLEMENTED IN REPOSITORY — nothing has been
provisioned or deployed to a real external host yet.** A concrete vendor
was selected (**Render** — see §3) and a production-runnable Docker image
(`apps/api/Dockerfile`) plus a Render Blueprint (`render.yaml`) were built
and verified end-to-end inside a real Linux container on this machine —
see §11 for the full verification evidence (startup, health/readiness,
graceful shutdown via a genuine `docker kill --signal=TERM`, restart
recovery, and live pg-boss job processing). No Render account/service was
created — applying `render.yaml` is the deliberately-deferred follow-up
provisioning step.

## 3. Concrete Hosting Target

**Selected: Render**, evaluated against Fly.io, Railway, and a self-managed
VM — all capable of running Node.js + Fastify + pg-boss + a continuous
Postgres connection + LISTEN/NOTIFY + a cron-style scheduler + graceful
shutdown, since all four support arbitrary persistent processes. Render was
preferred for the lowest operational complexity at this project's
MVP/pilot scale: native GitHub-repository builds, a built-in health-check
path, straightforward environment-variable/secret management, and a
documented `render.yaml` Blueprint format for repository-tracked service
configuration. A self-managed VM was rejected as higher-ops (OS patching,
process supervision, TLS termination all become this project's own
responsibility for no evidenced benefit at pilot scale). Fly.io/Railway
remain reasonable alternatives if a future reason to switch emerges — the
actual deployable artifact (`apps/api/Dockerfile`) is portable to either
with no code change, so this is not a lock-in decision.

| Property | Value |
|---|---|
| Runtime type | Docker container (`apps/api/Dockerfile`), Node 24.19.0-alpine |
| Process model | One persistent process (Fastify + pg-boss together, unchanged from ADR-021) |
| Region strategy | Not yet decided — a single region is sufficient at pilot scale; whichever region is closest to the chosen Supabase project's own region once one exists |
| Minimum instance configuration | Render's "Starter" plan (smallest persistent-process tier) — sufficient for pilot-scale traffic |
| Scaling model | Vertical first (`numInstances: 1` in `render.yaml`, deliberate — see §12 Test D); horizontal later without code change, since pg-boss's singleton-key design already tolerates multiple instances |
| Health checks | `GET /api/v1/healthz` (liveness only — never touches the database, so a brief DB blip never causes a false-positive restart) — `healthCheckPath` in `render.yaml` |
| Restart behavior | Render restarts a container whose health check fails or that exits non-zero — standard behavior, not configured further here |
| Graceful shutdown | Render sends `SIGTERM` before force-killing on redeploy/restart — **verified in this task** (§11) to be handled correctly by `apps/api/src/index.ts`, using a real Linux container and a genuine `docker kill --signal=TERM` |
| Secrets mechanism | Render's own dashboard-managed environment variables (`sync: false` entries in `render.yaml` — never a literal value in the file) |
| Deployment mechanism | GitHub Actions (`ci.yml`'s `deploy-api` job, §7) triggers Render's Deploy Hook (a secret URL) on push to `main`; Render then builds the image itself from `apps/api/Dockerfile` |
| Rollback mechanism | Render's own instant-rollback-to-previous-deploy feature (dashboard/API) |
| Operational complexity/cost category | Low — a single small persistent-process service, no additional infrastructure component introduced |

This is a concrete implementation detail, not a new architectural decision
on top of ADR-021 (which deliberately left the vendor open) — no additional
ADR was created for it, per ADR-021's own text anticipating this as a
"follow-up provisioning decision."

## 4. Vercel Boundary (explicit, per F-06 Phase 13)

**Vercel is not the runtime for the Fastify + pg-boss persistent process**
(ADR-021). This is scoped narrowly:

- Vercel remains fully valid for anything actually designed for its
  execution model — most plausibly a future web frontend, which does not
  exist in this repository today. ADR-013's GitHub/CI-CD, Supabase, and EAS
  clauses are entirely unaffected; only its backend-hosting clause changed.
- This task does **not** claim Vercel is "globally incompatible with
  DigiHostel" — only that `apps/api`'s specific current architecture
  (persistent HTTP + pg-boss in one process) cannot run there.
- This task does **not** remove Vercel from ADR-013 — ADR-013's own status
  line and a supersession notice record exactly which clause changed,
  leaving the rest of that ADR's history intact (`docs/adr/README.md`'s
  immutability rule).
- No login, provisioning, or deployment against the eventual DigiHostel
  production Vercel account occurred in this task, and none should occur
  for the persistent backend process described here.

```
Persistent backend:                    Vercel:
Fastify + pg-boss                      only workloads intentionally
        ↓                              designed for Vercel's execution
persistent-process host (Render)       model (none exist in this repo yet)
```

## 5. Branch Flow

- `main` — production-tracking branch (SDD Ch.14 §14.5 also names
  `develop`/`feature/*`/`hotfix/*`/`release/*`, unchanged by this task).
- CI (`ci.yml`'s `verify` job) runs on every pull request and every push to
  `main`.
- `ci.yml`'s `deploy-api` job runs only on push to `main`, only after
  `verify` succeeds (`needs: verify`) — never on a pull request, never if
  any check failed.
- `deploy-migrations.yml` runs automatically on a push to `main` that
  touches `supabase/migrations/**`, or manually via `workflow_dispatch`.
- **Sequencing note**: migrations and API deploys are two independent
  triggers. When a change touches both schema and API code, merge/land the
  migration first and let it deploy, then merge the API-code change that
  depends on it — this repository does not (yet) automate that ordering
  across the two workflows, which is an acceptable, common pattern at this
  team's current scale rather than a gap requiring immediate automation.

## 6. External Environment Audit

### Supabase

- **No DigiHostel production project exists.** Verified via the
  authenticated Supabase CLI's own `projects list` — the only project
  visible to this account/org is `YatraSync`, an unrelated project that
  must never be treated as, modified as, or confused with DigiHostel's data.
  **PRODUCTION PROJECT NOT YET PROVISIONED.**
- Local Supabase stack: **VERIFIED** working (config in `supabase/config.toml`,
  migrations `0000`–`0004` apply cleanly, 64/64 pgTAP assertions pass).
- No project was created by this task (`EXTERNAL PREREQUISITE` — provisioning
  a real Supabase project, including choosing its plan/region and whether
  PITR is enabled, is a decision + likely a paid-tier commitment outside
  this task's authorization).

### Render

- No Render account/service has been created (`EXTERNAL PREREQUISITE`).
- `apps/api/Dockerfile` and `render.yaml` (both new) are **IMPLEMENTED IN
  REPOSITORY**, verified by an actual `docker build` + `docker run` +
  `docker kill --signal=TERM` cycle on this machine (§11) — not merely
  written and assumed correct.

### Vercel

- The authenticated Vercel CLI account (`tech-titan12`) has exactly one
  project, `ys` — the same unrelated project family as `YatraSync`. **No
  DigiHostel Vercel project exists.**
- Per ADR-021/§4, Vercel is not the intended host for `apps/api`. No
  `vercel.json` was created; creating one would represent a deployment path
  that was evaluated and rejected, not merely unconfigured.

### EAS

- `apps/parent-mobile/app.json` has no `extra.eas.projectId` and no `owner`
  field — this app has never been linked to a real EAS project.
- The EAS CLI's authentication status could not be confirmed in this
  environment (the `whoami` check did not return within a reasonable time,
  and this task does not force interactive login flows). Treated as **not
  verifiable** here, not as "confirmed absent."
- `apps/parent-mobile/eas.json` (`development`, `preview`, `production`
  build profiles) — **CONFIGURED BUT UNVERIFIED**; no `eas init`/`eas
  build:configure` was run, no build was triggered, and no signing
  credentials were created.
- Android `package` / iOS `bundleIdentifier` are not set in `app.json` —
  required before a real build, not invented here (a reverse-DNS namespace
  choice is a product decision, not this task's to make).

### GitHub

- Repository: `Abhishek-0704/DigiHostel`, public, default branch `main`.
  **VERIFIED** via `gh api`.
- Branch protection on `main`: **none configured** (`gh api
  repos/.../branches/main/protection` → 404 "Branch not protected"). No PR
  requirement, no required status checks, no force-push protection, no
  deletion protection. **NOT IMPLEMENTED.**
- GitHub Actions secrets: **0 configured.** GitHub Actions environments:
  **0 configured.**
- This task did **not** modify branch protection or create repository
  secrets/environments via the API, even though the authenticated `gh` CLI
  session technically could — those are live changes to shared repository
  administration/workflow that the user should confirm first (some, like
  branch protection, would immediately change how pushes to `main` behave).
  §17 documents the exact settings recommended.

## 7. CI (`.github/workflows/ci.yml`)

**`verify` job**, in order: checkout → Node 24.19.0 → Corepack → pnpm
11.25.0 → `pnpm install --frozen-lockfile` → typecheck → lint → format check
→ Supabase CLI 2.116.0 → `supabase start` → `supabase test db` → export
local connection details (`supabase status -o env`) → `pnpm exec vitest
run` (with `DATABASE_URL`/`SUPABASE_URL`/`SUPABASE_ANON_KEY` now set, so the
real-Postgres integration tests run for real rather than being skipped) →
`pnpm run build`.

**`deploy-api` job** (added by this task's implementation phase): runs only
on push to `main`, only `needs: verify` — POSTs to
`secrets.RENDER_DEPLOY_HOOK_URL` (§13), which does not exist yet, so this
job currently fails fast with a clear `::error::` message rather than doing
anything partial. Deliberately does **not** rebuild/re-run the checks
`verify` already performed, per this task's own "do not duplicate CI
unnecessarily" instruction.

Versions are pinned to exactly what this repository's own environment
resolves today — this workflow is the first place they become pinned;
nothing was silently upgraded.

**Verification performed**: every `verify`-job step was replicated locally,
in the same order, on this machine, and passed (632/632 tests including
real-Postgres integration paths, 64/64 pgTAP, clean build). The repository
was committed and pushed to `main` on 2026-09-06 (commit `856d81e`) as part
of the F-06-STAGING provisioning work (§8) — a real GitHub Actions run of
this workflow has not been separately confirmed (this task's own
provisioning used the Render API directly, not this CI workflow's
`deploy-api` job), but the code enabling it is now live on GitHub.

## 8. Staging Environment (F-06-STAGING, 2026-09-06)

### Staging vs. production — read this first

| | Staging (this section) | Production |
|---|---|---|
| Provider | Render, **Free** plan | Persistent always-on runtime required (ADR-021) |
| Purpose | Development/integration testing | Real user traffic |
| Spin-down | **Expected and accepted** — spins down after ~15 min idle | Must never spin down |
| pg-boss during spin-down | Not running (process is asleep) — **not guaranteed to operate continuously** | Must run continuously |
| Keep-alive workaround | **None used, none should be added** | N/A |
| Manual wake-up | Developers may manually wake the service when testing | N/A |

**Render Free is intentionally accepted for staging.** This is a deliberate
environment decision, not an unresolved defect: an attempt to move the
*staging* service to Render's minimum always-on plan (`starter` /
`0.5c-512mb`) was rejected by the Render API
(`"Plan requires payment information on file"`, HTTP 400, confirmed with
both plan identifiers) — no payment method exists on the account used for
staging. Adding one is a billing decision for the account owner, not
something this documentation treats as a blocker to close; **staging
remains on Free by choice for now**. This does not change ADR-021, which
remains the authoritative *production* architecture decision — production
must still use a persistent always-on runtime compatible with ADR-021
before any production deployment; it is simply not provisioned yet, and
provisioning it is out of scope here. No keep-alive, self-ping, or
artificial-traffic mechanism exists anywhere in this repository to mask
Free's spin-down behavior, and none should be added — verified by a
repository-wide search for such patterns (none found).

Everything below this note — schema, pg-boss, job processing, restart
recovery, the DB-interruption test — was genuinely verified live against
the real staging deployment while it was awake.

Real, live external infrastructure — not simulated. Provisioned under a
Supabase account and a Render account distinct from the ones used
elsewhere in this repository's history (the user explicitly chose to use
separate accounts for staging; see below for what was found and how it was
resolved).

### Supabase staging project

- **Project**: "DigiHostel" (ref `lhonrqjmlhlehpbxvrag`, region
  `ap-south-1`), on a Supabase account distinct from the one used for local
  CLI work earlier in this repository's history. This project already
  existed (created 2026-08-09, before this session) — it was not created by
  this task.
- **Critical finding, resolved**: the project's `public` schema already
  contained a substantial, unrelated 41-table/12-enum/10-function schema
  (`cab_sharing`, `community_posts`, `complaints`, `profiles`,
  `refresh_tokens`, `role_definitions`, etc.) that matches neither this
  repository's current implementation nor anything it should build on —
  almost certainly a remnant of the discarded pre-reset implementation
  (`docs/implementation-baseline.md`). **Every table had zero rows** —
  confirmed via `supabase inspect db table-stats` before taking any action.
  With explicit user confirmation, the old schema was dropped via targeted
  `DROP TABLE`/`DROP FUNCTION`/`DROP TYPE` statements (never a blanket
  `DROP SCHEMA public`, to avoid touching Supabase's own platform-level
  grants on that schema), then this repository's actual migration history
  (`0000`–`0004`) was applied cleanly via `supabase db push`.
- **Schema verification — VERIFIED, exact match to the local baseline**: 17
  tables, 17 RLS-enabled, 66 policies, 8 functions, 58 indexes — identical
  counts to the local dev instance.
- **pgTAP — classified, not fully executable as-is**: `supabase test db
  --linked` initially failed entirely (`pgtap` extension registered but its
  functions unreachable via this project's connection search_path);
  installing `pgtap` explicitly into the `public` schema fixed that, after
  which **00_setup.sql passes cleanly**, but every subsequent test file
  fails or errors in a way that is precisely and *only* explained by
  missing seed fixtures — every failure is either `have: 0 / want: N` (a
  query for a fixture row that doesn't exist) or `permission denied for
  table X` (RLS correctly denying access for a simulated identity with no
  backing `auth.users` row). **`supabase/seed.sql`'s own header explicitly
  states "Never run against a remote/production project"** (it inserts
  directly into `auth.users` with fake password hashes, which is safe only
  against the fully-local, disposable dev stack) — this task did not
  override that explicit safety warning to force a green pgTAP run.
  **Classification: infrastructure/configuration limitation of the
  existing test suite's local-only fixture design, not a migration defect
  or an RLS/implementation defect** — the schema/RLS *structure* match
  above, plus RLS visibly and correctly denying access with no matching
  identity, are strong indirect evidence the deployed policies are correct;
  full behavioral pgTAP coverage against a remote project would require a
  separate, remote-safe fixture mechanism (e.g. Supabase Admin API-based
  user creation) that does not exist today and was not built here (out of
  this task's "use the existing test suite" scope).

### Render staging service

- **Service**: `digihostel-api-staging` (id `srv-daeaqdn40ujc73eglbc0`),
  free plan, Singapore region, Docker runtime from `apps/api/Dockerfile`,
  `numInstances: 1`, health check `/api/v1/healthz`. Created on a Render
  account distinct from the one ("tech-titan12") used for CLI
  authentication earlier in this repository's history — confirmed empty
  (0 pre-existing services) before creation.
- **Environment variables set** (staging values, never committed):
  `NODE_ENV`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DATABASE_URL`,
  `BUILD_SHA`.
- **Critical finding, resolved**: the first deploy attempt failed —
  Render builds from GitHub, and **nothing in this entire remediation
  session (F-01 through F-06) had ever been pushed**, so GitHub's `main`
  was still at the pre-reset baseline commit (`a0df538`), which has no
  `apps/api/Dockerfile` at all. With explicit user confirmation, this
  session's accumulated work was committed and pushed to `main`
  (`856d81e`), and a fresh deploy was triggered.
- **Deploy result: VERIFIED live.** `GET /api/v1/healthz` → `200
  {"status":"ok"}`; `GET /api/v1/readyz` → `200 {"status":"ok"}` (real
  connectivity to the staging Postgres).
- **pg-boss — VERIFIED live**: `pgboss.schedule` shows
  `leave-notification-reap` / `* * * * *` / `UTC` registered; `pgboss.queue`
  shows all three real queues plus pg-boss's own internal dispatch queue.
  A real escalation job was enqueued against a minimal, obviously-synthetic
  fixture (`F-06-Staging Synthetic Hostel`/`Student`, fixed UUIDs prefixed
  `f6000000-...`) — the live service's own worker claimed and completed it
  within ~2 seconds, correctly advancing `father_notified` →
  `mother_notified` and scheduling the next stage's follow-up job (exactly
  ADR-017 §7's same-transaction scheduling). The fixture and its follow-up
  job were deleted immediately afterward — staging's domain tables were
  confirmed back to zero rows across `students`/`hostels`/`leave_requests`/
  `leave_approval_events`/`notifications`.
- **Restart recovery — VERIFIED, twice**: a manual restart (Render API)
  came back with `/readyz` returning `200` and the reaper schedule
  immediately intact (Postgres-persisted, not in-memory) both times.
- **Database interruption test (Resilience Test B, previously NOT
  EXECUTED) — now VERIFIED, with a notable finding**: `DATABASE_URL` was
  temporarily set to an unreachable address and the service restarted.
  `/readyz` briefly became unreachable (a slow connection-timeout hang, not
  an immediate clean failure — see "Limitations" below), but **the
  platform never actually took the broken configuration into production
  traffic** — Render's own deploy/restart health-check gating appears to
  have kept the last-known-good instance serving rather than cutting over
  to one that couldn't bind (per `apps/api/src/index.ts`'s own hardening,
  a pg-boss connection failure at startup crashes the process before it
  ever listens, which is itself a correct, intentional failure mode — see
  F-06's implementation phase). `DATABASE_URL` was restored and the service
  restarted again; `/healthz`, `/readyz`, and the pg-boss schedule were all
  reconfirmed healthy immediately after.
- **Rollback — mechanism confirmed available, not independently exercised
  with two distinct versions**: Render's native "rollback to a previous
  deploy" feature is present (dashboard + API); this task did not push a
  second, otherwise-meaningless commit purely to manufacture a "Version
  A → B → rollback" cycle, since only one real deploy exists so far and
  creating a throwaway version would pollute the repository's real commit
  history for no verification benefit beyond what the restart and
  DB-interruption tests already demonstrated about the platform's recovery
  behavior.

### GitHub

- A `staging` GitHub Actions environment was created with 5 secrets:
  `RENDER_API_KEY`, `RENDER_SERVICE_ID`, `SUPABASE_ACCESS_TOKEN`,
  `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD` — values never printed,
  logged, or committed.
- This session's accumulated work (F-01 through F-06) was committed and
  pushed to `main` (commit `856d81e`) with explicit user confirmation,
  specifically to unblock the Render build (see above). No production
  secrets, no production environment, and no production project were
  created anywhere in this process.

### Migration deployment mechanism used

`.github/workflows/deploy-migrations.yml` targets a `production`
environment/secrets and was **not** used for this staging provisioning —
migrations were applied directly via `supabase db push` against the
linked staging project instead, since no staging-specific migration
workflow existed yet.

**Update (QG-06 remediation, F-QG06-04, closed):** the "natural follow-up"
named above has been implemented —
`.github/workflows/deploy-migrations-staging.yml` now mirrors
`deploy-migrations.yml` exactly but targets the `staging` GitHub
environment's already-provisioned secrets. This closed a genuine
architecture-drift finding discovered during QG-06: because
`deploy-migrations.yml` itself always targeted the (empty) `production`
environment, it failed on every run against `main`, and Supabase's own
dashboard-configured GitHub Integration was silently the only mechanism
actually applying migrations to the shared project — exactly the "second,
redundant, and potentially conflicting migration-deployment path" ADR-013
says not to rely on. The new staging workflow makes GitHub Actions
genuinely authoritative for the environment that currently exists, as
ADR-013 intends. **Outstanding, requires the account owner's own action**:
the Supabase-side GitHub Integration itself has no CLI/Management-API
toggle found — it must be disabled manually via the Supabase Dashboard
(Project Settings → Integrations) once the new workflow is confirmed
successful, to remove the now-redundant second path entirely.

### Staging limitations (honest, not glossed over)

- **Free-plan spin-down (accepted, not a defect)**: the staging service is
  not continuously available; pg-boss scheduling/workers do not run while
  the service is asleep. Re-verified 2026-09-06: a controlled synthetic job
  (fixture `f6000000-...-000000000013`, immediately deleted afterward) was
  enqueued while the service was awake and processed in ~2 seconds
  (`father_notified → mother_notified`, `pgboss.job.completed_on` confirmed
  via direct query); a controlled restart came back with `/readyz` 200 and
  `pgboss.schedule` still showing `leave-notification-reap` / `* * * * *`.
  No 20-minute no-traffic persistence test was performed or claimed — that
  test is only meaningful for an always-on plan, which staging intentionally
  does not use.
- pgTAP is not fully executable against staging without either overriding
  `seed.sql`'s explicit "never run remotely" warning (not done) or building
  a new remote-safe fixture mechanism (not built, out of scope).
- The database-interruption test showed `/readyz`/the whole process can
  hang for a noticeable period (tens of seconds) while a Postgres client
  attempts a connection to an unreachable host, rather than failing
  instantly — `postgres-js`'s default connection-timeout was not
  explicitly tuned in this task; a shorter, explicit `connect_timeout`
  would make this fail faster and is a reasonable, low-risk future
  hardening item, not implemented here (scope discipline — this task
  verifies existing behavior, not iterate on it further).
- Rollback was confirmed available but not exercised end-to-end with two
  distinct deployed versions.
- `BUILD_SHA`/`/healthz`'s `version` field did not reliably reflect the
  value set via Render's env-var API within this session's testing
  window — a minor, cosmetic, disclosed gap, not investigated further.
- The account switch this task performed for Supabase CLI access is
  **not reversible from within this session** — the CLI's single stored
  credential now authenticates as the new (staging) account; restoring
  access to the original account requires the user to run `supabase login`
  again themselves.

## 9. Production Deployment

**DEPLOYED TO PRODUCTION (QG-06 / F-QG06-11 remediation, 2026-09-23/24).**
The API-hosting architecture (ADR-021, §2, §3) is decided, the Render
service exists (`digihostel-api-production`), and a repeatable,
repository-defined release workflow now exists:
`.github/workflows/deploy-production.yml`.

```
PR → CI validates ("Verify") → merge to main
   → maintainer deliberately dispatches "Deploy Production"
       (workflow_dispatch only — production does NOT auto-deploy on push,
       unlike staging; see the workflow file's own header comment for why)
   → guard job rejects any ref other than main
   → migrate job (reuses deploy-migrations.yml as a workflow_call — the
       exact same migration mechanism §10 describes, not a second one)
   → deploy-api job (needs: migrate) triggers a real Render deploy via the
       Render API (POST /v1/services/{id}/deploys — Render exposes no
       deploy-hook-URL retrieval via API, confirmed empirically, so this
       uses an account-scoped RENDER_API_KEY stored only on the `production`
       GitHub environment) and polls until the deploy reaches `live` or
       fails
   → verify job checks /api/v1/healthz's `version` field against the exact
       commit SHA this workflow ran against, and /api/v1/readyz for
       database connectivity — the workflow fails if either check fails
```

This differs from staging's flow (`ci.yml`'s `deploy-api` job, which
auto-deploys on every push to `main`) deliberately: neither ADR-013 nor
ADR-021 mandates an automatic production trigger, and a controlled,
deliberate promotion step was judged the safer default for real user
traffic. See the workflow file itself for the full rationale.

**First live execution**: production was originally stood up via one-off
manual Render/Supabase API calls during QG-06 remediation (deploy
`dep-daq2qj8473hc73eb15k0`, commit `75dcc49...`) — this workflow is the
repeatable replacement for that manual procedure, not yet itself exercised
end-to-end at the time this section was written (see the F-QG06-11
remediation report for live-execution evidence, added once a real dispatch
has been observed to succeed).

## 10. Database Migration Deployment

**Chosen mechanism: a custom GitHub Action
(`.github/workflows/deploy-migrations.yml`), not Supabase's own dashboard
"GitHub Integration" auto-deploy feature** — matches ADR-013's explicit
"GitHub Actions for CI/CD" decision. Do not additionally enable Supabase's
native GitHub Integration for this project; that would create a second,
redundant migration-deployment path.

- Trigger: push to `main` touching `supabase/migrations/**`, or manual
  dispatch.
- Mechanism: `supabase link --project-ref … --password …` then
  `supabase db push` (additive only — this workflow never runs `supabase db
  reset` or any destructive command against a linked project).
- Requires `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`,
  `SUPABASE_DB_PASSWORD` as secrets on a `production` GitHub Actions
  environment (§13). Until those are configured, this workflow's `link` step
  fails immediately and clearly — it does nothing partial or destructive.
- **No developer should run `supabase db push` against production from a
  local machine as the normal deployment procedure** — this workflow exists
  specifically so that doesn't have to happen. Local `supabase db push`/`db
  reset` remain fine for local development against the dev stack only.
- **CONFIGURED BUT UNVERIFIED** — cannot be exercised until a production
  project and its secrets exist.

## 11. API Deployment — Implementation and Verification

`apps/api` is now genuinely production-runnable. Everything in this section
was actually executed on this machine, not merely written and assumed
correct.

### What was built

- **`apps/api/Dockerfile`** (new) — multi-stage build (Node
  24.19.0-alpine), pnpm-workspace-aware, produces a minimal runtime image
  containing only `apps/api`'s production dependencies and the pre-built
  `apps/api/dist`/`packages/db/dist` output.
- **`render.yaml`** (new) — Render Blueprint referencing the Dockerfile,
  `healthCheckPath: /api/v1/healthz`, `numInstances: 1`, and `sync: false`
  entries for every secret (§13) — never a literal value.
- **`GET /api/v1/readyz`** (new route, `apps/api/src/routes/health.ts`) —
  readiness: verifies Postgres connectivity via a trivial `select 1`, never
  a business query, never leaking the underlying error. Distinct from the
  existing `/healthz`, which stays a pure liveness check (never touches the
  database).
- **`GET /api/v1/healthz`** (updated) — now also returns a `version` field
  (`process.env.BUILD_SHA`, "unknown" if unset) so a running instance's
  exact deployed build is verifiable without exposing anything sensitive.
- **`apps/api/src/index.ts`** (hardened) — the entire startup sequence now
  runs inside a try/catch that logs a structured failure and exits
  non-zero on any unrecoverable startup error (previously an uncaught
  top-level rejection would exit correctly but bypass structured logging
  entirely); startup/shutdown now emit explicit structured log events
  (`"startup: beginning"`, `"startup: complete, accepting requests"`,
  `"shutdown: beginning"`, one line per shutdown step, `"shutdown:
  complete"`); shutdown now also closes the shared Postgres connection pool
  (`closeDb()`, new export from `@digihostel/db`) after stopping pg-boss —
  previously not closed at all; a 30-second force-exit safety timer now
  guards against a hung shutdown.
- **`packages/db/src/index.ts`** (new export) — `closeDb()`, wrapping the
  postgres-js client's own `.end()`, so `apps/api`'s shutdown sequence can
  actually close it (no other consumer of `@digihostel/db` needed this
  before).
- **`.dockerignore`** (new, repository root) — excludes `node_modules`,
  `dist`, and critically `**/tsconfig.tsbuildinfo` (see "Problems found and
  fixed" below).

### Startup — VERIFIED

Built the image (`docker build -f apps/api/Dockerfile -t digihostel-api .`)
and ran it as a real Linux container, connected to the actual local
Supabase Postgres instance running on this machine. Structured startup log,
in order:

```json
{"msg":"startup: beginning","buildSha":"docker-smoke-test","port":8080}
{"msg":"startup: background workers registered"}
{"msg":"Server listening at http://..."}
{"msg":"startup: complete, accepting requests","port":8080}
```

### Health / Readiness — VERIFIED

```
GET /api/v1/healthz -> 200 {"status":"ok","version":"docker-smoke-test"}
GET /api/v1/readyz  -> 200 {"status":"ok"}
```

`readyz`'s failure path was verified separately in the unit test suite
(`apps/api/src/routes/health.test.ts`, mocking `@digihostel/db`): a
simulated database failure returns `503 {"status":"not_ready"}`, and the
response body was asserted to never contain the underlying error's
connection string or credentials.

### pg-boss / Workers / Scheduler — VERIFIED live

- **Startup ordering** (existing, confirmed intentional and correct):
  `buildApp()` → `startBackgroundWorkers()` (starts pg-boss, registers the
  escalation/notification/reaper workers, registers the reaper's
  `"* * * * *"` schedule) → `app.listen(...)`. Workers are registered
  before the server starts accepting HTTP traffic.
- **Scheduler continuity**: queried `pgboss.schedule` directly —
  `leave-notification-reap` / `* * * * *` / `UTC` is present, confirming the
  F-03 reaper's recurring schedule is correctly registered (this table is
  Postgres-persisted, not in-memory, so it survives process restarts by
  construction).
- **Live job processing**: manually enqueued a real
  `leave-escalation-stage-evaluate` job (via pg-boss's own client, inside
  the running container) targeting an existing local seed leave request
  (`father_notified` status). The running container's worker picked it up
  within ~2 seconds and correctly advanced it to `mother_notified` —
  confirmed via the container's own structured log
  (`"escalation: advanced"`) and by re-querying the database. The test-induced
  state change (and the resulting `leave_approval_events` audit row) were
  reverted immediately afterward so the local seed/pgTAP fixtures were left
  exactly as found — confirmed by re-running `supabase test db` (64/64) and
  the full test suite (632/632) after cleanup.

### Graceful Shutdown — VERIFIED with a real POSIX signal

This could not be validated on this machine's own Windows host directly:
Node.js does not support `SIGTERM` delivery between two separate Windows
processes the way POSIX systems do (Node's own documentation states
`SIGTERM` sent via a cross-process `process.kill()` on Windows terminates
the target unconditionally, bypassing any registered handler — confirmed
empirically: no shutdown log appeared, and the process disappeared
immediately). **Docker Desktop's Linux VM backend was used instead**,
which delivers a genuine POSIX signal to the containerized Linux process —
exactly how the real production host (any of Render/Fly.io/Railway/a Linux
VM) will actually signal this process.

```bash
docker kill --signal=TERM <container>
```

Resulting structured log (real container, real signal, ~27ms total):

```json
{"msg":"shutdown: beginning","signal":"SIGTERM"}
{"msg":"shutdown: Fastify closed"}
{"msg":"shutdown: pg-boss stopped"}
{"msg":"shutdown: database connections closed"}
{"msg":"shutdown: complete","signal":"SIGTERM"}
```

Container exit code: `0`. The 30-second force-exit safety timer never
triggered (shutdown completed in milliseconds).

### Restart Recovery — VERIFIED

`docker start` on the same (stopped, not removed) container: clean restart,
identical structured startup sequence, `/api/v1/readyz` returned `200`
within ~330ms of process start, and the reaper's schedule (persisted in
Postgres, §"pg-boss / Workers / Scheduler" above) was immediately available
again with no re-registration gap.

### Resilience Tests (F-06 Phase 12)

- **Test A — process restart**: performed above; the process restarts
  cleanly and resumes serving/working immediately. Queued pg-boss work
  itself is Postgres-persisted (not in-memory), so it is recoverable by
  construction regardless of which instance eventually claims it — this
  was already F-03's own verified guarantee and is unaffected by this
  task's changes.
- **Test B — temporary database interruption**: not performed against a
  real isolated staging environment (none exists yet) — deferred, since
  doing this against the shared local dev Postgres would have risked
  disrupting other verification in this same session. `/api/v1/readyz`'s
  own design (§"What was built") is the mechanism that would surface this
  condition when it is eventually exercised.
- **Test C — scheduler continuity**: performed above (verified via
  `pgboss.schedule` before and after a restart).
- **Test D — duplicate worker safety**: **Horizontal worker/API scaling is
  intentionally deferred** — `render.yaml` sets `numInstances: 1`. Not
  tested with multiple concurrent instances in this task; pg-boss's
  singleton-key/conditional-claim design (already relied on by F-03) is
  understood to tolerate it, but this task does not claim horizontal
  production safety without having actually tested it.

### Problems found and fixed while building the Docker image

Both were genuine defects in the first draft of `apps/api/Dockerfile`/
`.dockerignore`, found by actually attempting the build rather than
assuming it would work:

1. **Missing `packages/api-spec/package.json`** in the build context caused
   `pnpm install --frozen-lockfile` to resolve an inconsistent dependency
   graph, surfacing as spurious `drizzle-orm` type errors from unrelated
   database adapters (mysql2/sqlite/singlestore) that this project never
   uses. Fixed by copying every workspace member's `package.json` before
   `pnpm install`.
2. **Missing `tsconfig.base.json`** in the build context caused
   `packages/db`'s `tsc` build to lose `esModuleInterop`/`skipLibCheck`,
   surfacing the same class of unrelated type errors. Fixed by copying it
   alongside the other root manifests.
3. **A stale `tsconfig.tsbuildinfo`, copied in from this host machine's own
   local build artifacts**, caused TypeScript's incremental-build check to
   believe `packages/db` was already built (since it only compares source
   file state, not whether the referenced output actually exists) and
   silently skip emitting `dist/` entirely — a "successful" build with no
   output. Fixed by excluding `**/tsconfig.tsbuildinfo` in `.dockerignore`.

## 12. Mobile / EAS Release

- `apps/parent-mobile/eas.json`: `development`, `preview`, `production`
  build profiles. `development` points `EXPO_PUBLIC_API_BASE_URL` at
  `http://localhost:8080/api/v1` (matching `apps/api`'s own default port) —
  **VERIFIED** as the correct local value, though the EAS build itself was
  never run. `preview`/`production` do not set `EXPO_PUBLIC_API_BASE_URL` —
  those real URLs don't exist yet; set them via EAS's own
  environment-variable mechanism once they do, rather than hardcoding here.
- No EAS project has been created/linked (`extra.eas.projectId` absent from
  `app.json`) — `EXTERNAL PREREQUISITE`.
- No Android `package` / iOS `bundleIdentifier` is set — a product decision,
  not invented by this task.
- No build was triggered, no signing credentials were created, per this
  task's explicit instruction.

## 13. Secret Management

Categories actually required by this implementation (confirmed by reading
the code that consumes them, not assumed):

| Secret | Used by | Status |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | `deploy-migrations.yml` (CLI auth), `production` GH environment | **Created** — scoped to the account owning `asphlfoikqyaeslmhrah` |
| `SUPABASE_PROJECT_ID` | `deploy-migrations.yml` (`supabase link`), `production` GH environment | **Created** — `asphlfoikqyaeslmhrah` |
| `SUPABASE_DB_PASSWORD` | `deploy-migrations.yml` (`supabase link`), `production` GH environment | **Created** |
| `RENDER_API_KEY` | `deploy-production.yml`'s `deploy-api` job, `production` GH environment | **Created** (2026-09-24, F-QG06-11). Account/workspace-scoped, not service-scoped — Render's API has no finer-grained token type; the workflow itself hardcodes the target service id so its *behavior* is constrained even though the credential's *capability* is broader. Documented honestly, not overstated as least-privilege. |
| `RENDER_DEPLOY_HOOK_URL` | `ci.yml`'s `deploy-api` job (staging only) | Created (staging), repo-level — unaffected by this update |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | `apps/api` runtime (auth boundary, OTP broker), set directly on the Render production service (not a GitHub secret — these are runtime env vars for the already-running service) | **Created** — production values point at `asphlfoikqyaeslmhrah`, verified distinct from staging's `lhonrqjmlhlehpbxvrag` values |
| `DATABASE_URL` | `apps/api` runtime (Drizzle, pg-boss), Render production env var | **Created** — Supavisor session-pooler connection string (direct `db.<ref>.supabase.co:5432` connections are IPv6-only/require a paid add-on; the pooler works over IPv4, which Render's outbound network uses) |
| `BUILD_SHA` / `RENDER_GIT_COMMIT` | `apps/api` runtime (`/healthz`'s `version` field) | Not a secret; Render injects `RENDER_GIT_COMMIT` automatically into every container — **verified live**, `/healthz.version` on production correctly reports the deployed commit SHA |
| `EXPO_ACCESS_TOKEN` | `apps/api`'s `ExpoPushSender` (optional — push notifications) | Not yet created; no real push tokens exist anywhere in this repository today (`docs/current-state.md`) — unaffected by this update |
| EAS credentials/token | Mobile release | Not yet created — unaffected by this update |

No secret value has been committed, printed, or logged anywhere in this
repository or in any tool output produced while creating them (F-QG06-11
remediation). Production credentials are stored locally, outside this
repository entirely, for the operator's own reuse — never inside
`C:\DigiHostel`. `render.yaml`'s `sync: false` entries remain accurate for
the fields it declares; production's actual values were set directly via
the Render API/dashboard against the already-created service, not through
a Blueprint sync (the Blueprint was never applied — the production service
was created via a direct API call, see §9).

## 14. Health Verification

- `GET /api/v1/healthz` — liveness, never touches the database — **VERIFIED**
  (unit tests + a real running container, §11). Configured as `render.yaml`'s
  `healthCheckPath` — the endpoint Render's own platform-level health check
  and restart logic will use once a service exists.
- `GET /api/v1/readyz` — readiness, verifies Postgres connectivity —
  **VERIFIED** (unit tests for both the success and failure path, plus a
  real running container for the success path, §11). Intended for
  human/tooling use (e.g. a manual post-deploy check), not necessarily the
  platform's own restart gate — a DB-touching check is a worse choice for
  that role, since a brief DB blip would otherwise cause an unnecessary
  container restart.
- **An automated post-deploy health-check workflow step now exists**
  (F-QG06-11, 2026-09-24) — `deploy-production.yml`'s `verify` job polls
  both `/healthz` (asserting the `version` field matches the exact commit
  the workflow ran against — real provenance verification, not just a `200`
  check) and `/readyz` (database connectivity) after every production
  deploy, and fails the workflow if either check fails. Render's own
  platform-level health check (§3) remains the independent, always-on
  restart gate; this workflow step is the release-time provenance/readiness
  gate, a distinct concern.

## 15. Rollback

### Application rollback

- **Render**: instant-rollback-to-previous-deploy is a native platform
  feature (redeploy an earlier `dep-*` id via `POST
  /v1/services/{id}/deploys/{deployId}/rollback` or the dashboard) —
  `CONFIGURED BUT UNVERIFIED`. The production service now exists, but as of
  this writing it has had only one real deploy of a distinct commit, so a
  rollback-to-a-different-commit test would have nothing meaningful to roll
  back to; exercising this for real is deferred to the first time a genuine
  second production release happens, rather than performed here as a
  no-op that would prove nothing (per this task's own "do not fabricate a
  meaningless test" instruction).
- **Git-level**: `git revert` + redeploy is the fallback for any host,
  always available regardless of hosting decision.
- **Mobile (EAS)**: EAS supports republishing a previous build/update
  channel — `NOT IMPLEMENTED`/unverified, no EAS project exists.

### Database rollback

**Do not treat migrations as always safely reversible.** This repository's
migration strategy (Drizzle-generated SQL under `supabase/migrations/`) is
**forward-fix by default**: a mistake is corrected by writing and deploying
a new migration, not by "rolling back" the previous one in place — several
of this repository's own migrations (e.g. `0003_f01_trusted_devices_rls_remediation.sql`)
are already exactly this pattern (a corrective migration layered on top,
never editing an already-applied one). A migration that is reversible
without data loss (e.g. adding a nullable column) may be manually reverted
with a new down-migration if genuinely safe to do so on a case-by-case
basis — this is not automated, and no such automatic script was created
here (this task explicitly forbids automatic destructive rollback tooling).

**For a genuinely destructive mistake** (wrong data deleted/overwritten),
the recovery mechanism would be backup/PITR restoration — see
`docs/runbooks/disaster-recovery.md`.

**Update (Prompt 20, release packaging, 2026-09-24) — recovery-risk
limitation, finalized.** The claim above ("currently unverified... because
no production project exists") is now stale and corrected: a real
production Supabase project (`asphlfoikqyaeslmhrah`) exists, and has
existed since the QG-06 production-infrastructure remediation. The current,
accurate state is: **production has no managed backup or PITR capability
of any kind, by explicit, governed decision, not by absence of
infrastructure.** [ADR-026](../adr/ADR-026-interim-production-recovery-risk-acceptance.md)
(ACCEPTED, partially superseding ADR-022) formally records this as a
time-bounded risk acceptance, and the SDD itself has been amended
accordingly (Ch.12 §12.7.1, Ch.16 §16.7.1, Ch.20 §20.4 — see ADR-026's own
"Addendum: SDD Formally Amended"). **This release checklist does not, and
must not, claim that a destructive-mistake recovery path exists.** It does
not. Rollback here means application/deployment rollback only (above) — it
does not extend to data recovery.

Render's own instant-rollback-to-previous-deploy capability (§Application
rollback above) now has a second, genuinely distinct production commit in
its history (`75dcc49` → `5bf4be2`, both real production deploys) — the
next genuine production release is a reasonable, low-risk opportunity to
finally exercise this capability for real rather than continuing to defer
it, since a real prior commit now exists to roll back to.

## 16. Emergency Procedure

1. Identify whether the incident is application-level (bad deploy) or
   data-level (bad migration/data mutation).
2. Application-level: roll back via §15's application-rollback path for
   whatever host is in use.
3. Data-level: do **not** attempt an improvised fix under pressure — see
   `docs/runbooks/disaster-recovery.md` for the actual recovery decision
   tree, and get explicit approval before touching a production database.
4. Notify whoever owns the production environment per §17's responsible
   party.

## 17. Responsible Operator / Approval Point

Not specified by the SDD or any accepted ADR — no named role/person is
recorded anywhere in this repository as the production-deployment approver.
**REQUIREMENT NOT SPECIFIED.** Recommended minimum before production use:
name a specific approver for the `production` GitHub Actions environment
(via required reviewers) — this task did not assign one, since choosing a
specific person is a decision for the repository owner, not something to
invent.

## 18. Recommended Repository Settings

**Applied** (QG-06 remediation, various dates):
- Require a pull request before merging to `main` — **applied**.
- Require the `Verify` job from `ci.yml` to pass before merging — **applied**.
- Disallow force pushes to `main` — **applied**.
- Disallow deletion of `main` — **applied**.
- `production` GitHub Actions environment exists with `SUPABASE_ACCESS_TOKEN`,
  `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`, and (F-QG06-11,
  2026-09-24) `RENDER_API_KEY` — **applied**.
- `production` environment's deployment branch policy restricted to `main`
  only (`custom_branch_policies: true`, one policy: `main`) — **applied**
  (F-QG06-11, 2026-09-24). This is a structural, platform-enforced
  guarantee independent of `deploy-production.yml`'s own `guard` job — two
  independent layers rejecting the same class of mistake.

**Still not applied** — a deliberate, undecided item, not an oversight:
- At least 1 required approving PR review — this repository's branch
  protection has `required_approving_review_count: 0` throughout
  (single-maintainer repo; an unbreakable self-approval deadlock was
  avoided intentionally, per this project's own established precedent).
  Adding a required-reviewer rule specifically to the `production`
  environment (distinct from branch protection) remains available and
  would name a specific approver — a decision for the repository owner,
  not invented here (§17).

## 19. Limitations

Updated (QG-06 / F-QG06-11, 2026-09-24) — production Supabase/Render now
exist and several items below are resolved; kept as an honest running list
rather than silently rewritten:

- No EAS project exists — mobile release remains entirely undeployed;
  unaffected by this update.
- Test B (temporary database interruption) was not exercised against
  production — deferred, not performed merely to check a box, since it
  would require deliberately degrading a real production database that now
  holds a real administrator account.
- Horizontal scaling (multiple concurrent API/worker instances) is
  untested — `numInstances: 1` on both staging and production, deliberate,
  not yet revisited.
- Production Supabase's billing plan could not be determined via the
  available API token (org-subscription endpoint returns `403`) —
  genuinely unverified, not assumed Free or Pro.
- Production PITR/backups remain disabled (F-QG06-01) — an account-owner
  billing decision, explicitly out of this remediation's scope. Now
  formally recorded as a governed, time-bounded risk acceptance rather than
  an undocumented gap — see
  [ADR-026](../adr/ADR-026-interim-production-recovery-risk-acceptance.md).
- No production administrator account exists (F-QG06-09) — an
  account-owner action per this project's standing prohibition on
  autonomous account creation, explicitly out of this remediation's scope.
- Whether Supabase's own dashboard-side GitHub Integration is active on the
  new production project is unverified (F-QG06-13) — no API/CLI surface
  exposes this; requires manual dashboard inspection by the account owner.
- Production Vercel's own deployment was performed via `vercel --prod` from
  a local checkout rather than a GitHub-integration-triggered build
  (F-QG06-12, MINOR) — the artifact's provenance was verified manually at
  deploy time (clean `git status`, `HEAD` confirmed) but Vercel's own
  platform doesn't carry native commit metadata for it. This remediation's
  scope was the production **API** deployment path (F-QG06-11) — extending
  it to Vercel was explicitly out of scope per that task's own instructions
  (§17), not overlooked.
- `deploy-production.yml`'s Render deploy credential (`RENDER_API_KEY`) is
  account/workspace-scoped rather than service-scoped — Render's API has no
  finer-grained token type available to narrow this further; documented as
  a known, platform-imposed limitation rather than a gap in this
  implementation.
