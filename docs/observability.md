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
  `{status: "ok", version: BUILD_SHA}`. Unchanged by this task (already
  correct per F-06). Rate-limit exempt.
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
  **Available, not independently re-verified by dashboard inspection in
  this task** (no interactive Supabase dashboard session was available in
  this environment) — this is an honest gap, not a claim of "verified."
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

- **What is live-verified on Render staging today**: the *pre-F-07*
  baseline only — `/healthz`/`/readyz` respond correctly (re-confirmed
  live during this task), Fastify's own structured request logging and
  pg-boss job processing were already proven end-to-end in F-06's own
  verification. **The F-07 code changes in this task (redaction, the
  `x-request-id` header/body field, per-worker registration logging, the
  new job-failure/notification-outcome/reaper-tick logs) have NOT been
  deployed to Render staging** — deploying requires pushing to the
  connected GitHub branch, which is outside this task's authorization (no
  commit/push was made, per explicit instruction). Confirmed directly: a
  live `curl` against the staging `/healthz` during this task returned no
  `x-request-id` header, proving the currently-running instance predates
  this change.
- **What is verified**, instead, against a **real local runtime** (not a
  mock): the actual compiled `apps/api/dist/index.js`, against the real
  local Supabase/Postgres/pg-boss stack — startup/worker-registration logs,
  `/healthz`/`/readyz` with the new headers, a real 4xx with `reqId`
  correlation, and a real pg-boss job execution with the new structured
  worker log line. This is genuine evidence, not a fabricated claim, but it
  is **local, not staging or production** evidence.
- **PRODUCTION BLOCKER — staging limitation / infrastructure decision
  required**: F-07's code is only verifiable end-to-end on Render/Supabase
  once deployed; that deployment is a deliberate, separate, authorization-
  gated action (a `git push` to `main`), not performed here. Supabase's own
  Reports/Log Drains long-term-retention limitations (§8) are a genuine,
  separate, plan-tier constraint that upgrading Supabase would resolve —
  not attempted here, per this task's explicit "do not upgrade" instruction.

## 10. What this task did not do

- Did not install Sentry or any other APM/error-tracking tool.
- Did not add a metrics/Prometheus stack.
- Did not create any alert, threshold, or on-call rule.
- Did not add keep-alive/synthetic traffic to Render staging.
- Did not modify `render.yaml`, `supabase/config.toml`, or any billing/plan
  setting.
- Did not touch `security_incidents`/`audit_logs` schemas, RLS, or content.
- Did not commit or push.
