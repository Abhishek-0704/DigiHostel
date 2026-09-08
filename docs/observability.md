# Production Observability

This document records the current, verified observability posture of
`apps/api` (PRR Finding F-07). It distinguishes **implemented** (code
exists and is exercised by a test or a live run), **configured** (a
platform feature is turned on), **verified** (observed with real evidence
in this task, not merely assumed), **available** (the platform offers it,
whether or not this project currently uses it), **deferred** (a real,
accepted future decision, not a gap), and **plan-limited** (blocked by the
current Render Free / Supabase Free tier, not by missing code).

Do not read "implemented" as "verified in production" — see §6 for the
staging/production boundary this document deliberately does not blur.

## 1. Logging

- **Logger**: `apps/api/src/lib/logger.ts` — pino, JSON in production,
  `pino-pretty` only when `NODE_ENV=development`. **Implemented, verified**
  (live local run, `supabase/tests` unaffected, `apps/api/src/lib/logger.test.ts`).
- **Base fields on every line**: `pid`, `hostname`, `service` (`digihostel-api`),
  `buildSha` (`BUILD_SHA` env var, `"unknown"` if unset). **Implemented,
  verified**.
- **Component tagging**: background-worker/queue log lines carry
  `component: "worker"` (via `workerLogger`, a `.child()` of the base
  logger); HTTP-request-path lines carry no `component` field at all —
  deliberately not a redundant default, since pino's `.child()` bindings are
  appended rather than merged into `base`, and a colliding default would
  produce a genuinely duplicated JSON key (harmless to a spec-compliant
  parser, needlessly messy in raw text — found and fixed during this task).
  Per ADR-021's own anticipated "Future F-07" direction ("application-level
  tagging... via a `component` label on log lines"). **Implemented,
  verified**.
- **Redaction**: `redact.paths` covers `req.headers.authorization`,
  `req.headers.cookie`, and a fixed list of well-known sensitive field names
  (`password`, `token`, `accessToken`/`access_token`, `refreshToken`/
  `refresh_token`, `otp`, `otpCode`, `pushToken`, `expoPushToken`,
  `deviceToken`, `biometricAssertion`, `serviceRoleKey`, `jwt`), both as a
  bare top-level key and nested one level (`*.<key>`). **Implemented,
  verified** (`logger.test.ts`, 4 assertions). This is defense-in-depth: a
  repository-wide search (Phase 16 of the F-07 remediation) found **no
  existing call site that actually logs any of these fields today** —
  `otpSender.ts`/`otpChallengeStore.ts` never pass phone numbers or codes to
  the logger, `guards.ts` never logs token contents (only a `code` and the
  caller's own `userId`), and the one plausible risk (`err` objects from a
  failed Supabase OTP dispatch, `domain/auth/service.ts`) is a generic
  `Error`, not a raw payload — redaction protects against a *future*
  regression, not a fix for a present leak.
- **Roll-number logging classification**: `domain/auth/service.ts` logs the
  attempted `rollNumber`/`relationshipType` when an OTP request resolves to
  an *ineligible* caller. Classified **intentional, not a leak** — this is
  the one signal Phase 7's "OTP request abuse" / "invalid challenge
  attempts" observability requirement needs, and a roll number is not a
  phone number, token, or OTP code; removing it would remove genuine
  abuse-detection value for no privacy gain (a rejected, possibly-invalid
  roll number is not private data about a real student in the way a phone
  number is). Not redacted, by design.
- **`console.*` usage**: none exists anywhere in `apps/api/src` (verified by
  repository-wide search) — every log call already goes through pino.

## 2. Request correlation

- **Request ID**: Fastify's own built-in per-request ID (`request.id`),
  generated internally (`req-1`, `req-2`, ... per process). **`requestIdHeader`
  is never configured anywhere in this codebase** — verified against the
  installed Fastify 5.12.1's own config defaults
  (`requestIdHeader` defaults to `false`), meaning **no client-supplied
  header is ever read, trusted, or parsed for this purpose**. This was
  already safe before this task; no change was needed here, and Phase 4's
  "prevent attacker-controlled arbitrary-length or malformed IDs" concern
  does not apply to this codebase.
- **Propagation to logs**: automatic — every `request.log.*` call
  (Fastify's per-request child logger) carries `reqId`. **Implemented,
  verified** (live local run, §5 below).
- **Propagation to the client (the actual gap this task closed)**: previously
  the ID never left the server at all — a client experiencing a failure had
  nothing to hand support. Now: (a) an `onSend` hook (`app.ts`) sets an
  `x-request-id` response header on **every** response, 2xx included; (b)
  the global error handler includes `requestId` in the JSON body for both
  the framework-4xx path and the unexpected-5xx path. Typed domain errors a
  route maps itself (e.g. leave-request 404/409) do **not** carry
  `requestId` in the body — they never reach the global handler — but the
  header is still present on those responses too. **Implemented, verified**
  (unit tests in `errorHandler.test.ts`/`health.test.ts`; live local curl,
  §5). Documented as an additive, optional field in
  `packages/api-spec/openapi.yaml`'s `ErrorBody` schema; Orval regenerated.
- **No second/duplicate correlation ID was introduced** — Fastify's existing
  mechanism was reused end-to-end, per this task's explicit instruction not
  to invent a redundant one.
- **Multi-instance caveat**: the ID is unique only within one running
  process's lifetime (a sequential counter, not a UUID). `render.yaml`
  currently pins `numInstances: 1` (ADR-021), so this is not a present gap;
  if a future production deployment ever scales to more than one instance,
  two instances could each produce `req-1` and collide in aggregated logs.
  Recorded here, not fixed pre-emptively (YAGNI — this codebase's own
  stated convention).

## 3. HTTP request/error observability

- Fastify's built-in request logging (`loggerInstance: logger` in
  `app.ts`) already produces one `"incoming request"` line (method, url,
  host, remoteAddress) and one `"request completed"` line (`statusCode`,
  `responseTime`) per request, both carrying `reqId`. **Implemented,
  verified** — this predates F-07 and was re-confirmed unchanged.
- Full request/response **bodies are never logged** — Fastify's default
  logging serializers log only the metadata above, never `request.body`.
  Verified by repository-wide search: no route or plugin ever passes
  `request.body` to the logger.
- **Severity separation (Phase 6)**: `errorHandler.ts` logs an expected,
  framework-generated 4xx at `request.log.info(...)`, and an unexpected
  error (anything else, always mapped to 500) at
  `request.log.error({ err }, ...)`. Live-verified: a malformed-JSON POST
  produced a `level: 30` (info) log line; the existing vitest suite already
  covers the `error`-level 500 path with a raw `Error` containing a
  connection string, asserting neither the message, the string, nor a stack
  ever reaches the response body.
- A route's own typed domain errors (`sendLeaveError` in `routes/leave.ts`)
  are mapped to a response before ever reaching the global handler, and are
  unaffected by this task.

## 4. Authentication/authorization observability

- `guards.ts`'s `createAuthenticate` logs every rejection at
  `request.log.info({ code }, "auth: rejected")` — missing token, invalid/
  expired JWT (via `JwtVerificationError.code`), or a valid session with no
  resolved app profile (`{ userId: claims.sub }`, the caller's own id, never
  a secret). **Implemented, verified** — this predates F-07, confirmed
  unchanged and non-leaking by direct source inspection (the file's own
  header comment already documents this exact tradeoff).
- **OTP abuse signal**: see §1's roll-number classification above —
  ineligible OTP requests are logged with the attempted roll number/
  relationship, giving an operator a real (if manual, log-search-based)
  path to notice a burst of ineligible attempts. No rate-limit-triggered
  event is separately logged (the rate limiter itself returns a 429; that
  429 flows through the same request-completed log line as any other
  status code).
- **RLS-related authorization failures** are not, and should not be, surfaced
  through `apps/api`'s pino logs — the database never tells Fastify *why* a
  row was invisible (RLS denial and "doesn't exist" are indistinguishable by
  design, the established anti-enumeration pattern throughout this schema).
  This is correct, existing behavior, not a gap.
- **This task did not create a second security-event system.** `audit_logs`
  (service-role-only, no client RLS policy at all) and `security_incidents`
  (student-safety domain, F-05/F-05A-hardened RLS) remain the two canonical
  domains for anything requiring durable, queryable business/security
  history. Nothing in this task writes to either — see §7.

## 5. pg-boss / worker observability

| Signal | Before F-07 | After F-07 |
|---|---|---|
| pg-boss start/stop | silent | `"pg-boss: started"` / `"pg-boss: stopped"` (`lib/queue/boss.ts`) |
| pg-boss internal error | `boss.on("error", ...)` already logged it | unchanged |
| Worker registration | one blanket `"startup: background workers registered"` line after all three | one line per worker with its own `queue` identity, in addition to the existing blanket line |
| Escalation job outcome | logged (`"escalation: advanced"` / `"...no-op"`) | unchanged |
| Escalation job **unhandled error** | **silently swallowed by pg-boss — no pino log line at all** | now caught, logged at `error` with `jobId`/`leaveRequestId`, re-thrown so pg-boss's own retry/backoff still applies |
| Notification delivery outcome (sent/retry/exhausted) | only reflected in the `notifications` table row, never logged | now logged at `info`/`warn` with `notificationId`/`leaveRequestId`/`stage`/`attemptsMade` — never token contents or message text |
| Notification worker unhandled error | already logged (`"notification worker: unexpected error"`) | unchanged |
| Reaper stale-claim reclaim | logged per-claim + a run-summary when `count > 0` | unchanged |
| Reaper "ran, found nothing" | **no evidence at all that the schedule fired** | `debug`-level `"notification reaper: run complete, no stale claims found"` — available on demand, not steady-state noise at `info` |
| Reaper unhandled error | **silently swallowed — no pino log line** | now caught and logged, same pattern as escalation |

All job-outcome logs use identifiers (`notificationId`, `leaveRequestId`,
`jobId`, `stage`) — never a full payload, never push-token/message content.

**Live-verified** (this task, local runtime — see §6): a real escalation job
was enqueued via a direct pg-boss `send()` against the actual local
Postgres/pg-boss stack (a deliberately stale `expectedStage`, guaranteeing a
safe no-op — no fixture mutation), and the exact expected structured log
line (`component: "worker"`, correct IDs, `"escalation: stale/superseded
job, no-op"`) appeared within seconds. The seed fixture's
`leave_requests.status` was independently confirmed unchanged afterward.

An operator can now answer, from logs alone: is a worker registered
(startup logs, per-queue)? did a specific job execute and with what outcome
(escalation/notification logs, by ID)? is a job failing (escalation/reaper
`error`-level logs, previously absent)? is the reaper's schedule firing
(`debug`-level tick, available on demand)? Retry-count escalation and
delivery-exhaustion are both now visible per notification.

## 6. Health and readiness

- **`/healthz`**: liveness only — never touches Postgres, returns
  `{status: "ok", version: ...}`. Rate-limit exempt. **`version`'s source
  corrected by F-07E** — see §11 below; this section's semantics are
  otherwise unchanged since F-06.
- **`/readyz`**: checks Postgres only (`select 1`) — the one dependency
  every route and every pg-boss worker actually shares. Unchanged
  semantics; **added**: a `request.log.warn({ err }, "readyz: dependency
  check failed")` on failure (previously silent — a 503 with zero
  server-side explanation). The client-facing response is unchanged
  (`{status: "not_ready"}`, still never leaks the underlying error).
- **Worker initialization is not independently checked by `/readyz`** —
  and does not need to be: `index.ts`'s startup sequence calls
  `startBackgroundWorkers()` *before* `app.listen()`, so if any worker
  failed to register, the process would already have exited during startup
  (caught by the outer try/catch, logged, `process.exit(1)`) before
  `/readyz` could ever become reachable. Adding a redundant worker check to
  `/readyz` would duplicate an invariant the startup ordering already
  enforces, not close a real gap.
- **No optional service gates readiness** — confirmed by inspection; the
  only dependency checked is Postgres, which is mandatory for every code
  path.

## 7. Audit vs. operational vs. security-incident boundary

Three distinct domains, not collapsed into one:

- **`audit_logs`** — immutable business/security accountability (leave
  approval/rejection, etc.). Service-role-only, no client RLS policy at
  all. Source of truth for "what happened, who did it." Nothing in this
  task writes here.
- **Application/operational logs (this document)** — pino, ephemeral,
  for diagnosing *why the system behaved a certain way right now*
  (request failed, worker restarted, DB unreachable). Never the source of
  truth for business history — if a log line and `audit_logs` ever
  disagreed about whether a leave request was approved, `audit_logs` wins.
- **`security_incidents`** — the canonical security-incident domain
  (missed-checkpoint/manual-flag student-safety events), hostel-scope
  isolation hardened by F-05/F-05A. Distinct from both of the above; an
  application log line about, say, repeated OTP failures is an
  *operational* signal an operator might act on, not itself a
  `security_incidents` row — this task does not write application-log
  content into that table, and does not invent a fourth domain.

## 8. Metrics and alerting — NOT SPECIFIED, not invented

No accepted ADR, the SDD, or `docs/technology-decision-matrix.md` specifies
a numeric SLO, an alert threshold, or an application-level metrics stack.
Per this task's explicit instruction, none was invented. What exists today:

- **Supabase native platform metrics/dashboards** (Reports, Logs Explorer
  for API/Postgres/Auth/Realtime) — available on the current plan per
  Supabase's own documented Free-tier behavior (short-window Reports
  history; Log Drains require Pro/Team/Enterprise, not purchased here).
  **Postgres logs (Logs Explorer) verified live and current, 2026-09-08**
  (§13) via the Management API's analytics endpoint — a real, non-dashboard
  form of verification, distinct from an interactive dashboard session
  (still not performed). API/Auth/Realtime log streams and the Reports
  dashboard's own charts remain unverified by direct inspection.
- **Render's own log stream** for the staging service — the mechanism
  every piece of evidence in this document that predates F-07 (F-06's own
  verification) already relied on.
- **No Prometheus/APM/metrics-stack code exists**, and none was added.
  Supabase's own Prometheus-compatible Metrics API exists (documented beta)
  but consuming it would mean building a scraper/dashboard this task's own
  scope explicitly warns against inventing without a requirement driving
  it. **Gap, documented, not fabricated as solved.**
- **No alert is configured anywhere** (no PagerDuty/Slack/email webhook,
  no Render or Supabase alert rule created by this task). Below is a
  **proposed**, not accepted, starting set of thresholds — explicitly not
  presented as a product requirement:

| Signal | Proposed threshold | Proposed window | Severity | Destination | Owner | Runbook |
|---|---|---|---|---|---|---|
| `/readyz` failing | any failure | 2 consecutive checks | Critical | *undecided* | *undecided* | this document, §6 |
| Sustained 5xx rate | >5% of requests | 5 min | Critical | *undecided* | *undecided* | this document, §3 |
| Worker registration failure | any | startup | Critical | *undecided* | *undecided* | this document, §5 |
| Escalation/notification job repeated failure | >3 consecutive `error`-level job logs for the same queue | 15 min | Operational | *undecided* | *undecided* | this document, §5 |
| Stale notification claims reclaimed | >10 in one reaper run | per run (1 min) | Operational | *undecided* | *undecided* | this document, §5 |
| OTP-ineligible request burst | *no threshold established* | *undecided* | Security | *undecided* | *undecided* | this document, §4 |

All "*undecided*" cells are real gaps requiring a product/ops decision, not
this task inventing one. **Sentry remains explicitly deferred** — ADR-013
and `docs/technology-decision-matrix.md` both record it as "recommended
but not part of scaffolding-time scope" / "deferred to implementation
time," and this task did not install it, per its own explicit instruction
not to.

## 9. Staging vs. production boundary

**Updated by F-07B (2026-09-06): F-07's code is now deployed to and
live-verified on Render staging.** The section below reflects that; see
`docs/current-state.md`'s F-07 entry for the full evidence trail.

- **Deployment**: commit `84ac504` (F-05/F-05A/F-07) was pushed to `main`.
  Deploying it surfaced a genuine, pre-existing, unrelated defect —
  `.github/workflows/ci.yml`'s `Verify` job had never once succeeded on any
  push to this repository (confirmed against both this push and the
  original F-01–F-06 push): `supabase status -o env`'s quoted output
  (`DB_URL="postgresql://..."`) was appended to `$GITHUB_ENV` verbatim,
  which does not strip shell-style quoting, so `SUPABASE_URL` contained
  literal quote characters and failed `supabase-js`'s own URL validation.
  Since `deploy-api` has `needs: verify`, this also meant Render's deploy
  hook had never once been triggered by this pipeline for any prior push —
  fixed in commit `3c9c602`. Separately, `RENDER_DEPLOY_HOOK_URL` had never
  been configured as a GitHub Actions secret at all (the currently-running
  staging service was originally deployed via a one-time manual Render API
  call during F-06-STAGING, outside this pipeline) — the user supplied the
  deploy hook URL for this task, it was set as a GitHub secret via `gh
  secret set` (handled as a secret throughout, never displayed), and the
  failed `Deploy apps/api` job was re-run successfully.
- **Live-verified on Render staging** (this task, real HTTP requests
  against `https://digihostel-api-staging.onrender.com`, not local):
  `/healthz` and `/readyz` both 200; every response (2xx/4xx/404) carries a
  distinct `x-request-id` header; a live malformed-JSON 400 carried
  `requestId` in both the header and the body, matching exactly; a live
  401 (typed domain error) carried the header but not a body `requestId`,
  matching the documented, deliberate distinction in §2. Rate-limit headers
  observed and correctly tiered (300/min general, 30/min on the
  leave-requests POST route), unaffected by this task.
- **Worker/pg-boss observability, live-verified via direct read-only SQL**
  against the real staging Postgres (`supabase db query --linked` /
  `supabase inspect db table-stats --linked` — Management-API-backed, no
  raw `DATABASE_URL` needed or used): `pgboss.job_common` row count and
  `seq_scans` measurably increased between two checks minutes apart;
  querying by queue name directly showed `leave-notification-reap` with
  115 executions, the most recent **seconds before the query itself**,
  and `230 completed / 1 created / 0 failed` across the reaper's and
  pg-boss's own internal maintenance jobs — direct, current, real evidence
  the reaper's `* * * * *` schedule and the core pg-boss engine are both
  alive and executing successfully on the newly-deployed instance. The
  application-specific `leave-escalation-stage-evaluate` /
  `leave-notification-deliver` queues show only historical rows from an
  earlier session (last activity hours prior) — correctly explained by
  staging's `leave_requests` table having zero rows (`seed.sql` is never
  run remotely, by its own explicit safety header), not a worker defect.
- **What was deliberately NOT done, and why**: a synthetic job was not
  hand-enqueued into staging's `pgboss.job` table this task. The
  established, safe F-03/F-06 mechanism enqueues via pg-boss's own
  `.send()` client against the real `DATABASE_URL`; that connection string
  was not available in this session (only a narrower deploy-hook credential
  was provided). Hand-crafting a raw SQL `INSERT` replicating pg-boss's
  internal 29-column job-insert shape against a live, shared database was
  considered and rejected as exactly the kind of ad-hoc, unestablished
  mechanism this task's own instructions warn against — the reaper's own
  naturally-recurring schedule (above) provided equivalent, safer, real
  evidence instead, without requiring any write action at all.
- **Render log-stream access**: not available in this session (only a
  deploy-trigger credential was provided, not a full API key or dashboard
  session). Client-side response evidence above (matching `x-request-id`
  values across the header and body) proves *internal* correlation
  consistency; independently confirming the *same* ID against Render's own
  server-side log line was not possible without log-read access. This is
  reported honestly as a genuine evidence gap, not glossed over.
- **A controlled 5xx was not attempted against staging** — no safe,
  non-destructive mechanism exists to trigger one in this application (every
  intentionally-reachable failure mode maps to a typed 4xx); the existing
  vitest suite's real-`Error`-with-embedded-connection-string test remains
  the authoritative evidence for the 500 path's redaction/correlation
  behavior.
- **A dedicated restart/redeploy cycle was not performed separately** —
  the deployment itself already constituted one (old container serving
  pre-F-07 code stopped, new container started), and `/readyz` returning
  200 immediately after confirms the new process's startup sequence
  (`buildApp()` succeeding, therefore Postgres connectivity; pg-boss's own
  maintenance loop firing, therefore `startBackgroundWorkers()` succeeding)
  completed correctly — inferred from external behavior, since the actual
  startup log lines themselves were not directly observable without Render
  log access.
- **Supabase Logs Explorer / Reports / Metrics API**: not interactively
  inspected in this task either (no dashboard session, no Management API
  personal access token available for those specific endpoints). What
  *was* obtained instead — genuine, read-only, live evidence via the
  Supabase CLI's own Management-API-backed `inspect db` commands (`db-stats`:
  14MB database, 100% index/table cache hit rates, 80MB WAL; `table-stats`:
  per-table row/scan counts, including the pg-boss evidence above). This is
  real database-level observability, but it is **not** the same product as
  Logs Explorer/Reports/the Prometheus-compatible Metrics API, and should
  not be conflated with having "verified Supabase Logs/Reports/Metrics" —
  those remain unverified in this task.
- **Re-verified live, 2026-09-08** (F-07 closure): `pgboss.job`, queried
  directly (`supabase db query --linked`), shows `leave-notification-reap`
  at **276 completed executions, 0 failed**, most recent completion
  seconds before the query — the reaper's `* * * * *` schedule remains
  alive and healthy two days after the F-07B evidence above. The two
  application-specific queues (`leave-escalation-stage-evaluate`,
  `leave-notification-deliver`) still show only 2 completed executions
  each, both from 2026-09-06 — unchanged and correctly explained by
  staging's `leave_requests` table remaining empty (no seed data run
  remotely), not a worker defect.
- **PRODUCTION BLOCKER — remaining, genuine**: F-05's and F-05A's
  migrations (`0005`/`0006`) are still **not applied to the real staging
  database** — `deploy-migrations.yml` has the identical missing-secrets
  problem as `ci.yml` had (`SUPABASE_ACCESS_TOKEN`/`SUPABASE_PROJECT_ID`/
  `SUPABASE_DB_PASSWORD` all confirmed empty), so the corrected
  hostel/reception RLS scoping exists only in code and in the local dev
  database, not yet on the live staging Postgres instance. This is an
  F-05/F-05A deployment gap surfaced during F-07B's process, not fixed here
  (out of this task's scope — applying migrations to the live staging
  database is a distinct, consequential action from what this task's
  authorization covered). Render/Supabase plan upgrades remain untouched,
  per this task's explicit instruction.

## 10. What this task (F-07 + F-07B) did not do

- Did not install Sentry or any other APM/error-tracking tool.
- Did not add a metrics/Prometheus stack, Grafana, Datadog, or Better
  Stack.
- Did not create any alert, threshold, or on-call rule/destination.
- Did not add keep-alive/synthetic traffic to Render staging.
- Did not modify `render.yaml`, `supabase/config.toml`, or any billing/plan
  setting — Render and Supabase both remain on their current Free tier.
- Did not touch `security_incidents`/`audit_logs` schemas, RLS, or content
  beyond what F-05/F-05A already changed and reported separately.
- Did not apply the F-05/F-05A migrations to the real staging database
  (§9 — a genuine, separate, remaining gap).
- Did not hand-craft a raw SQL job insertion against pg-boss's internal
  schema on the live staging database (§9 — considered and rejected as an
  unsafe, ad-hoc mechanism).
- F-07's own remediation task did not commit or push (by explicit
  instruction); F-07B's task explicitly authorized, and performed, exactly
  one deployment push plus one necessary CI-config fix discovered in the
  process — both recorded in `docs/current-state.md`.
- F-07 closure (this task, 2026-09-08) found and fixed the `logger.ts`
  `buildSha` defect (§12) but did **not** commit or push it, and did not
  upgrade Supabase/Render, add Sentry, or add any paid observability
  platform.

## 14. F-07 closure — operational question checklist (2026-09-08)

Every question this task's own scope named, answered with a direct
pointer to where the evidence already lives in this document:

**API**: (1) alive → `/healthz` §6, live-verified 200. (2) DB-ready →
`/readyz` §6, live-verified 200. (3) which build → `/healthz.version`,
live-verified matching `HEAD` (§12). (4)-(6) which request/endpoint/status
failed → `reqId` + `req`/`res` fields on every log line, §3, live-correlated
§13. (7) duration → `responseTime` on every `"request completed"` line,
§3. (8) locate the server log → Render's `GET /v1/logs`, verified this
task, §13. (9) redaction → §1, unchanged, still correct.

**Database**: (10) availability → `/readyz`'s `select 1` check, §6. (11)
correlate DB failures to requests → `readyz: dependency check failed` logs
`reqId` implicitly via the request child logger, §6. (12) critical DB
failures visible in logs → yes, `request.log.warn`, §6. (13) RLS/auth vs.
infra failures → **not distinguishable through `apps/api`'s logs, by
design** (§4) — RLS denial and "doesn't exist" are indistinguishable at
the database layer (the established anti-enumeration pattern); an
infrastructure-level DB-unreachable failure surfaces distinctly via
`/readyz`'s own warn log, which an RLS denial never produces (RLS denials
never reach `/readyz` at all — they occur inside authorized route
handlers, not the liveness check).

**pg-boss**: (14) worker startup failures → caught by the outer
`index.ts` try/catch, `process.exit(1)`, logged at `error`, §5.
(15)-(16) job/reaper processing failures → `error`-level logs with
`jobId`/`notificationId`, previously silent, fixed by F-07, §5,
re-verified live 2026-09-08 (§9, 0 failures observed — healthy, not
untested). (17) restart behaviour → `"pg-boss: started"`/`"pg-boss:
stopped"`, §5. (18) repeated failures vs. ordinary errors → distinguished
by `component: "worker"` tagging plus the specific `jobId`/queue name in
each line, §1/§5 — no automated repeated-failure counter exists (§8's
proposed-not-accepted alert table).

**Notifications**: (19) processing failures → `notification: attempt
failed, retry scheduled` / `notification worker: unexpected error`, §5.
(20) retry exhaustion → `notification: retries exhausted, permanently
failed`, §5. (21) stale claims/reaper → `notification reaper: reclaiming a
stale delivery attempt`, §5, live-verified 2026-09-08 the schedule itself
is firing (§9). (22) correlate to a leave request without sensitive
payload → `leaveRequestId`/`notificationId`/`stage` only, never token/message
content, §5.

**Deployment**: (23) deployed build SHA → `/healthz.version`, F-07E,
re-verified live matching `HEAD` this task (§12). (24) correlate a
deployment to failures → possible via Render's own deploy-history API
(F-07D precedent) cross-referenced against log timestamps/`buildSha` —
**with §12's fix**, `buildSha` in logs is now also trustworthy for this,
not just `/healthz`. (25) detect stale deployment state → exactly the
class of defect §12 found and fixed; no automated staleness detector
exists (would require comparing `/healthz.version` against Render's deploy
API on a schedule — a **PRODUCTION FOLLOW-UP**, not built here).

## 15. Metrics classification (2026-09-08)

| Metric | Status | Evidence |
|---|---|---|
| API request count | AVAILABLE BUT NOT AUTOMATED | Countable from Render/Postgres logs by hand; no dashboard/counter built |
| API error rate | AVAILABLE BUT NOT AUTOMATED | Same — `res.statusCode` on every log line, no aggregation |
| API latency | AVAILABLE BUT NOT AUTOMATED | `responseTime` on every log line, §3, no aggregation/percentile computation |
| Readiness failures | AVAILABLE BUT NOT AUTOMATED | `readyz: dependency check failed` warn logs, §6, no counter |
| Worker failures | VERIFIED LIVE (currently zero) | `pgboss.job` query, §9/§14 — 0 failed across all three queues as of 2026-09-08 |
| Notification failures | AVAILABLE BUT NOT AUTOMATED | Logged per-attempt (§5), queryable from `notifications` table, no dashboard |
| Retry counts | AVAILABLE BUT NOT AUTOMATED | `attemptsMade` field on every retry log line, §5, no aggregation |
| Stale claims | VERIFIED LIVE (currently zero pending) | Reaper's own log/schedule, §9 — 276 clean runs, no stale claims found in the sampled window |
| Deployment failures | PRODUCTION-ONLY | Render's own deploy-history API shows success/failure per deploy (F-07D precedent); no automated alert on it |

## 16. Alerting classification (2026-09-08)

- **Existing alerts**: none — confirmed by inspection of `render.yaml` (no
  alert/notification config) and by the absence of any
  PagerDuty/Slack/webhook integration anywhere in this repository. Render's
  own default account-level notifications (e.g. deploy failure emails) may
  exist at the platform level but were not inspected this task (no
  dashboard session) and are not something this repository configures.
- **Verified**: nothing — no alert path was live-tested, because none
  exists to test.
- **Manual**: every signal in §15 marked "AVAILABLE BUT NOT AUTOMATED" is
  detectable today by a human reading logs/querying the database on
  demand — this is real, existing operational capability, just not
  automated into a push notification.
- **Production-only / PRODUCTION FOLLOW-UP** (not built here, per this
  task's explicit instruction not to invent an unreliable workaround under
  the current Free-tier environment): automated sustained-5xx alerting,
  worker-failure alerting, deployment-failure alerting, readiness-failure
  alerting. §8's proposed threshold table remains the starting point for
  this future work — still marked proposed, not accepted, unchanged by
  this task.

## 11. Build provenance (F-07E)

**Defect, confirmed and fixed 2026-09-07.** `/healthz`'s `version` field
previously read only `process.env.BUILD_SHA`, a plain env var the live
staging service (`digihostel-api-staging`) had set to a **static string**
(`856d81eb3b143f79e4dbbedfb44841a3c4997037`) once, manually, during
F-06-STAGING's provisioning — nothing in this repository's deploy path
(the `deploy-api` GitHub Actions job only POSTs to a Render deploy hook
URL) ever updates it. Confirmed via direct Render API evidence (F-07D):
Render's own deploy history showed the actual live deploy was a different,
later commit than what `/healthz` reported — the field was provably
stale, not merely suspected to be.

`render.yaml`'s own `fromService: RENDER_GIT_COMMIT` binding for
`BUILD_SHA` was never in effect either, because the real service was
provisioned manually rather than by applying that Blueprint (a Blueprint
sync onto the existing, differently-named service was evaluated and
rejected as unsafe/uncertain — Render Blueprints match services by name,
and `render.yaml`'s service is named `digihostel-api`, not
`digihostel-api-staging`, so a sync risked creating a second, duplicate
service rather than adopting the existing one).

**Fix**: `apps/api/src/routes/health.ts` now reads
`process.env.RENDER_GIT_COMMIT` first — a variable Render injects
automatically into every running container, with no `envVars`
configuration required at all — falling back to the existing `BUILD_SHA`
env var only for non-Render hosts (local dev). This needed no GitHub
secret, no Render API call, no pipeline change, and no Blueprint
adoption: `RENDER_GIT_COMMIT` is correct and current on every deploy by
construction, eliminating the manually-maintained value entirely rather
than adding a mechanism to keep it in sync. `render.yaml`'s now-redundant
`BUILD_SHA`/`fromService` entry was removed for the same reason (avoiding
a second, competing declared source of truth in the template, even though
that template was never actually applied to the live service).

Live-verified (E1, direct Render API + `/healthz` comparison) — see the
F-07E task's own final report for the exact deploy SHA / `/healthz.version`
equality evidence at the time of the fix. The live service's now-unused,
stale `BUILD_SHA` env var was left in place (harmless — no longer read
with priority) rather than deleted, to keep this fix minimal.

## 12. F-07 closure (2026-09-08) — a second `BUILD_SHA` call site, found and fixed

**This does not reopen or redo F-07E.** F-07E's own fix (`/healthz.version`
reading `RENDER_GIT_COMMIT` first) has not regressed — re-verified live this
task: `GET /healthz` on staging returned `{"status":"ok","version":"53415ba09b571beee6633132a109b7e0963ac256"}`,
exactly matching this repository's current `HEAD` at verification time.

**A second, previously-missed call site was found**: `apps/api/src/lib/logger.ts`'s
pino `base.buildSha` field still read only `process.env.BUILD_SHA` — the
same stale, manually-set value F-07E's fix bypassed for `/healthz`, but
never touched here. **Confirmed live**, not just by code inspection: real
Render log lines fetched this task (`GET /v1/logs`, Render API) show every
single log line on the live staging service carrying
`"buildSha":"856d81eb3b143f79e4dbbedfb44841a3c4997037"` — a commit several
pushes behind the actually-running `53415ba0...` — while `/healthz.version`
correctly reports the current one. An operator correlating a log line's
`buildSha` to "which commit produced this" would have been misled, even
though "which build is deployed" (via `/healthz`) was already correct.

**Fix, mirroring F-07E's own established pattern exactly**: `logger.ts`'s
`base.buildSha` now reads `process.env.RENDER_GIT_COMMIT ?? process.env.BUILD_SHA ?? "unknown"`,
identical precedence to `health.ts`. Two new tests added
(`logger.test.ts`) verifying both branches of the precedence via a dynamic
re-import of the real module (not a reproduction of the expression), mirroring
`health.test.ts`'s existing F-07E test pattern. This fix has **not been
deployed** — it exists only in this repository's working tree as of this
task; the live service will continue showing the stale `buildSha` in logs
until this change is committed, pushed, and deployed (a decision and action
outside this task's own scope/authorization).

## 13. Evidence gaps closed this task (2026-09-08)

Two gaps §9/§8 previously recorded as honest, unresolved limitations were
closed this task, using access that was not available in prior F-07
sessions:

- **Render log-stream access** — §9's "not available in this session"
  note describes F-07B's own session specifically (only a deploy-trigger
  credential then); F-07C/D (2026-09-06/07) already established broader
  Render API access and used it for this exact kind of correlation.
  **Re-verified fresh this task**: the same Render API key provided full
  read access to `GET /v1/logs`, used to fetch real server-side log lines
  and match them, request-ID for request-ID, against client-side responses
  generated live this task (`req-6`→401 `missing_token`, `req-8`→404
  route-not-found, `req-9`→400 `FST_ERR_CTP_INVALID_JSON_BODY`) — genuine
  client↔server request-ID correlation, freshly confirmed with today's
  traffic and today's deployed commit, not merely reused from an old
  record. No sensitive data (tokens, headers, bodies) appeared in any
  fetched log line. **This same log fetch is also what directly confirmed
  §12's `buildSha` defect** — real log lines showing the stale value,
  not an inference.
- **Supabase Postgres logs (Logs Explorer)** — F-07C/D (2026-09-06/07)
  already established these are accessible via the Management API
  (`101 entries/day` at the time). §9's F-07B-specific text separately
  says a *dashboard* session was never available — that remains true and
  unchanged; the Management-API path is the one actually used, both then
  and now. **Re-verified fresh this task**: the same
  `analytics/endpoints/logs.all` endpoint returned real, current
  `postgres_logs` rows — including, by coincidence, two of this task's own
  malformed test SQL queries appearing within seconds of being issued,
  direct proof of currency, not just accessibility. **Not claimed**: that
  these logs carry the application's `x-request-id`/`reqId` — they don't
  (DigiHostel's query layer, `@digihostel/db`, adds no request-tagging SQL
  comment), so correlating a Postgres log line to a specific API request
  would require timestamp proximity, not literal ID matching. Recorded
  accurately, not overclaimed.
