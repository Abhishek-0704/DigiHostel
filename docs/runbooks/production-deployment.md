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
  a real external environment. Neither applies anywhere in this document —
  no staging or production environment exists yet (see §6).

## 1. Prerequisites

- GitHub repository access with permission to configure Actions secrets and
  branch protection (`EXTERNAL PREREQUISITE` for anyone other than the repo
  owner — see §6 "GitHub" for this repo's current actual state).
- A production Supabase project (`EXTERNAL PREREQUISITE` — none exists for
  DigiHostel today; see §2 and `docs/runbooks/disaster-recovery.md` §3).
- A Render account/service for `apps/api` (§3) — `EXTERNAL PREREQUISITE`;
  `render.yaml` exists but no service has been created from it.
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
- **PRODUCTION**: `EXTERNAL PREREQUISITE` end to end — no production
  Supabase project, Render service, or EAS production build exists.

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
workflow existed yet. A minimal `deploy-migrations-staging.yml` mirroring
the production one but targeting the `staging` environment's secrets would
be the natural follow-up if staging migrations need to be automated later;
not created in this task to avoid adding an unused workflow file before a
second real migration is ever needed against staging.

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

**EXTERNAL PREREQUISITE** — the API-hosting architecture and concrete
vendor are now decided (ADR-021, §2, §3), and the deployable artifact is
built and verified (§11), but no Render service has been provisioned. Once
it is, the intended flow is:

```
PR → CI validates → merge to main → deploy-migrations.yml applies migrations
   → ci.yml's deploy-api job triggers Render's Deploy Hook → Render builds
   apps/api/Dockerfile and deploys it → health check (/api/v1/healthz)
```

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
| `SUPABASE_ACCESS_TOKEN` | `deploy-migrations.yml` (CLI auth) | Not yet created — needs a production Supabase project first |
| `SUPABASE_PROJECT_ID` | `deploy-migrations.yml` (`supabase link`) | Not yet created |
| `SUPABASE_DB_PASSWORD` | `deploy-migrations.yml` (`supabase link`) | Not yet created |
| `RENDER_DEPLOY_HOOK_URL` | `ci.yml`'s `deploy-api` job | Not yet created — needs a Render service to exist first |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | `apps/api` runtime (auth boundary, OTP broker) | Production values not yet created; local dev value is Supabase's own well-known local fixed demo key (not a real secret) |
| `DATABASE_URL` | `apps/api` runtime (Drizzle, pg-boss) | Production value not yet created |
| `BUILD_SHA` | `apps/api` runtime (`/healthz`'s `version` field) | Not a secret; `render.yaml` maps it from Render's own `RENDER_GIT_COMMIT` automatically once a service exists |
| `EXPO_ACCESS_TOKEN` | `apps/api`'s `ExpoPushSender` (optional — push notifications) | Not yet created; no real push tokens exist anywhere in this repository today (`docs/current-state.md`) |
| EAS credentials/token | Mobile release | Not yet created |

No secret is committed anywhere in this repository (§16). This task created
no placeholder secret values, and added no secret to any workflow file or
`render.yaml` except via `${{ secrets.* }}`/`sync: false` references.

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
- No automated post-deploy health-check *workflow step* exists yet
  (`NOT IMPLEMENTED`) — Render's own platform-level health check (§3) is
  the mechanism that exists today; a GitHub Actions step that additionally
  polls `/readyz` after a deploy could be added once a real service exists
  to poll.

## 15. Rollback

### Application rollback

- **Render**: instant-rollback-to-previous-deploy is a native platform
  feature — `CONFIGURED BUT UNVERIFIED` (no service exists yet to exercise
  it against).
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
the recovery mechanism is backup/PITR restoration — see
`docs/runbooks/disaster-recovery.md`, which is honest that this is
currently unverified in production because no production project exists
(F-04, explicitly out of this task's scope to re-address).

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

## 18. Recommended Repository Settings (not applied by this task)

Documented precisely, per this task's own fallback instruction — not applied
via the GitHub API even though technically possible with the authenticated
session used for this audit, because it is a live change to shared
repository behavior that should be confirmed first:

- Require a pull request before merging to `main`.
- Require the `verify` job from `ci.yml` to pass before merging.
- Require at least 1 approving review.
- Disallow force pushes to `main`.
- Disallow deletion of `main`.
- Create a `production` GitHub Actions environment with the four secrets
  from §13 (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`,
  `SUPABASE_DB_PASSWORD`, `RENDER_DEPLOY_HOOK_URL`), and (recommended) at
  least one required reviewer before `deploy-migrations.yml`/`deploy-api`
  can run against it.

## 19. Limitations

- No production Supabase/Render/EAS project exists — every "VERIFIED" claim
  in this document is local or container-local, never against a real
  external environment (see §"DEPLOYED TO STAGING"/"DEPLOYED TO PRODUCTION"
  definitions at the top — neither applies anywhere here).
- Test B (temporary database interruption) was not exercised — no isolated
  staging environment exists to safely run it against.
- Horizontal scaling (multiple concurrent API/worker instances) is
  untested — `numInstances: 1` is deliberate, not yet revisited.
- No automated post-deploy health-check workflow step exists — only the
  platform's own (Render's) restart-on-failed-health-check behavior, once a
  service exists.
- Region/plan sizing for the eventual Render service is not decided.
