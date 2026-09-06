# ADR-021: API + pg-boss Worker Runtime Hosting (Partial Supersession of ADR-013)

- **ADR ID:** ADR-021
- **Title:** API + pg-boss Worker Runtime Hosting
- **Status:** ACCEPTED
- **Date:** 2026-09-06
- **Supersedes:** ADR-013 (backend-hosting clause only — "Vercel (backend/web hosting)" as it applies to `apps/api`; ADR-013's GitHub/CI-CD, Supabase, and EAS clauses are unaffected and remain in force)
- **Related ADRs:** ADR-005 (Backend Architecture — Fastify/Node, unaffected), ADR-011 (Background Job Architecture — pg-boss, unaffected), ADR-013 (Deployment Architecture — partially superseded, see above), ADR-018 (Notification Delivery Reliability — unaffected, same mechanism), ADR-019 (Leave Escalation State-Sequencing — unaffected, same mechanism).

## Context

F-06 (Production Deployment / CI-CD remediation, PRR Phase 13) discovered that
ADR-013's selection of Vercel for backend hosting was never reconciled with
ADR-011's selection of pg-boss for background jobs at the runtime/process
level. This ADR performs that reconciliation as a dedicated architecture-analysis
task (F-06A), using the actual source code as evidence, not assumption.

### Existing conflicting decisions

- **ADR-013** (2026-09-02): "Vercel (backend/web hosting)... matching the
  SDD's deployment chapter directly," with no runtime-model analysis of
  what `apps/api` actually needs to run continuously.
- **ADR-011** (2026-09-02): "pg-boss, a Postgres-native job queue... Used
  for: per-request escalation timers... notification delivery retries,"
  with no hosting-target analysis of whether the chosen backend host can
  actually run it.

Neither ADR was wrong in isolation; neither considered the other's runtime
implications. This is the first task to inspect both together against the
actual implementation.

## Problem Statement

**Verified directly from source** (`apps/api/src/index.ts`,
`apps/api/src/workers/*.ts`, the installed `pg-boss@12.29.0` package's own
`dist/timekeeper.js` and `dist/attorney.js`):

1. `apps/api/src/index.ts` starts Fastify (`app.listen(...)`) and pg-boss's
   background workers (`startBackgroundWorkers()`) in **one Node process**,
   sharing one `process.on("SIGTERM"/"SIGINT")` graceful-shutdown handler
   that closes both together. This is a deliberate, documented choice
   ("operational simplicity," per `workers/start.ts`'s own comment), not an
   accident — but it was never evaluated against ADR-013's hosting choice.
2. **Ordinary job processing** (`boss.work(...)`, used by the escalation
   worker, notification worker, and F-03's reaper) is interval-polling plus
   LISTEN/NOTIFY-driven (`pollingIntervalSeconds`, minimum 500ms per
   `attorney.js`'s `POLICY.MIN_POLLING_INTERVAL_MS`) — it requires a live,
   continuously-connected client process. There is no request-triggered or
   invocation-scoped mode.
3. **Scheduled/cron jobs** (`boss.schedule(...)`, used by F-03's
   notification reaper, `"* * * * *"`) are driven entirely by pg-boss's own
   client-side `Timekeeper` class: `start()` registers a `setInterval` that
   calls `onCron()` on a fixed cadence, which evaluates each cron
   expression's "is this due" window (`shouldSendIt`: due only if the
   previous scheduled tick was within the last 60 seconds) and enqueues a
   job if so. **This mechanism has no server-side (database-native)
   component and no catch-up semantics for a long-downtime gap** — if the
   process holding this `Timekeeper` is not continuously running, scheduled
   ticks are not queued, evaluated, or caught up later; they are simply
   never produced. Confirmed by reading the installed package's own source,
   not assumed from documentation.
4. `startAfterMs`-delayed jobs (used for notification retries, ADR-018 §3)
   rely on the same `work()` polling loop noticing a delayed job has become
   due — also requires the process to be alive continuously, not merely
   "callable."
5. **Positive finding**: `apps/api/src/app.ts` (`buildApp()`, the entire
   Fastify HTTP surface) has **zero** import of pg-boss or any
   `workers/`/`lib/queue/` module — confirmed by direct search. The HTTP API
   and the background workers are already code-level independent; they are
   coupled only at the `index.ts` entrypoint, which calls both. This
   materially lowers the cost of any option that would separate them.

**Conclusion**: `apps/api` as implemented requires an always-on process for
correct pg-boss operation (both ordinary jobs and, especially, cron-scheduled
maintenance like the F-03 reaper). A serverless/request-scoped execution
model — which is what Vercel's Functions provide, with no mechanism for a
persistent background loop between invocations — cannot host this
architecture's worker component at all, regardless of configuration.

## Vercel Compatibility Analysis

**What Vercel can host well**: stateless HTTP request/response handlers —
`apps/api`'s Fastify routes, in isolation, are architecturally the right
shape for this (each route handler is already a pure request-in,
response-out function with no cross-request in-memory state it depends on
for correctness — `InMemoryOtpChallengeStore` from the F-02 remediation is
the one exception, and is already documented as a disclosed single-process
limitation).

**What Vercel cannot guarantee**: any code that must keep running between
requests with no external trigger. There is no primitive for "start this
process and keep it alive indefinitely" on Vercel's Functions product.
Vercel Cron Jobs exist, but they invoke a fresh, bounded-duration function
execution on a fixed schedule — they do not provide a persistent worker loop,
and adapting pg-boss's `work()`/`Timekeeper` model to a "poll once per cron
invocation" shape would be a real reimplementation of how this codebase's
jobs are processed, not a configuration change.

**Which responsibilities require a persistent process**: the escalation
scheduler, the notification delivery worker (including its retry
scheduling), and the F-03 notification reaper — i.e., everything in
`apps/api/src/workers/`.

**Can HTTP handling be separated from pg-boss execution?** Yes, and already
is at the code level (finding 5 above) — only the process entrypoint
currently combines them.

## Options Considered

### Option A — Split: Vercel (HTTP API) + a separate persistent worker process

- **Compatibility**: Works — Fastify's HTTP surface has no code-level
  dependency on pg-boss (finding 5).
- **Operational complexity**: Higher — two deployable units, two sets of
  environment variables/secrets to keep in sync, two health/monitoring
  surfaces, two places `SUPABASE_URL`/`DATABASE_URL` must be configured
  identically.
- **Deployment complexity**: Higher — two CI/CD deploy jobs instead of one.
- **Cost**: Potentially lower at high, bursty HTTP traffic (serverless
  scale-to-zero) but ADR-011 itself already frames this system as
  "MVP/pilot-hostel scale, not high-frequency job volume" — no evidence this
  system has bursty traffic that would make the split's cost benefit real
  today.
- **Scaling**: API and worker scale independently — a genuine advantage if
  their load profiles diverge significantly, which there is no current
  evidence for.
- **Failure isolation**: Better — an API crash cannot take down the worker
  and vice versa (today, one process crash does).
- **Security**: Slightly larger surface (two deployment targets to secure)
  but no new secret categories.
- **Notification reliability / pg-boss correctness**: Unaffected — the
  worker process still runs pg-boss exactly as implemented; F-03/ADR-018's
  guarantees hold unchanged as long as the worker process itself is
  persistent, which this option still provides.
- **Developer complexity**: Higher — two local-dev run configurations
  instead of one (though `pnpm --filter @digihostel/api run dev` already
  starts both together today; a split would need a second script).
- **Rollback complexity**: Higher — two deployments to roll back in
  coordination if a change spans both.
- **Migration effort from today**: **Low-to-moderate** — thanks to finding 5,
  this is closer to "add a second entrypoint file that calls
  `startBackgroundWorkers()` alone, with its own shutdown handler" than a
  redesign. Still real work: two build/deploy pipelines, environment-variable
  duplication, and monitoring for two surfaces instead of one.
- **F-03 compatibility**: Fully preserved (worker process is still
  persistent).
- **F-04 compatibility**: Unaffected (still just Postgres via
  `DATABASE_URL`).
- **Future observability (F-07)**: Two surfaces to instrument instead of
  one — more setup, arguably better isolation of API vs. worker metrics.

### Option B — Persistent host for both API and worker (today's exact shape, different hosting target)

- **Compatibility**: Works — this is exactly what already runs locally and
  in every prior verification phase (F-01 through F-04) today; no runtime
  behavior changes at all.
- **Operational complexity**: Lowest of the three — one deployable unit,
  one set of environment variables, one health surface, one process to
  monitor and restart.
- **Cost**: A persistent small Node process (256MB–512MB class) is
  inexpensive at MVP/pilot scale on any of several mainstream hosts; likely
  comparable to or cheaper than running two separate deployment products.
- **Scaling**: Vertical/horizontal scaling of the combined process is
  simpler to reason about than coordinating two independently-scaled
  surfaces, though API and worker cannot scale independently under load.
- **Failure isolation**: Weakest of the three — an unhandled exception in
  either the HTTP layer or a worker could in principle affect the other,
  though this is exactly today's existing, already-accepted risk profile
  (ADR-011 accepted this coupling "for operational simplicity" without
  objection).
- **Security**: No change from today.
- **Notification reliability / pg-boss correctness**: Identical to today —
  zero code change, so every one of F-03's crash-recovery guarantees
  (lease-based claim, reaper, idempotent redelivery) is preserved exactly
  as already implemented and verified.
- **Developer complexity**: No change from today (`pnpm --filter
  @digihostel/api run dev` already does exactly this).
- **Rollback complexity**: Lowest — one deployment to roll back, same as
  today's local/dev model.
- **Migration effort from today**: **Lowest of the three — zero application
  code changes.** Only the deployment target and ADR-013's Vercel clause
  change.
- **Implications for ADR-013**: Requires partially superseding ADR-013's
  backend-hosting clause specifically (this ADR does so — its GitHub/CI-CD,
  Supabase, and EAS clauses are untouched, exactly the same supersession
  shape ADR-014 already used against ADR-006's auth-strategy clause only).
- **F-03 compatibility**: Perfect — unchanged mechanism.
- **F-04 compatibility**: Unaffected.
- **Future observability (F-07)**: One surface to instrument — simpler
  initial setup; API-vs-worker metric separation would rely on
  application-level tagging rather than infrastructure-level separation.

### Option C — Replace/rearchitect pg-boss for a serverless-native model

- **Migration cost**: **Highest by far.** Every job-scheduling call site
  (`enqueueEscalationJob`, `enqueueNotificationJob`, the reaper's
  `boss.schedule`), the `JobScheduler` interface and both its
  implementations, the escalation/notification/reaper worker registration
  functions, and the pg-boss-specific transaction-adapter usage
  (`fromDrizzle`, ADR-017 §7's "same transaction" guarantee) would all need
  reworking against a fundamentally different execution model (e.g. Vercel
  Cron invoking short-lived batch-processing routes).
- **Reliability / retry semantics / crash recovery**: F-03's entire,
  recently-verified remediation (lease-based conditional claim, the
  minute-cadence reaper, idempotent redelivery) is built specifically
  against pg-boss's polling+cron model. A serverless-native replacement
  would need to **re-derive and re-verify every one of those guarantees
  from scratch** against a different failure model (e.g., what does "a
  crash mid-attempt" even mean when each attempt is its own stateless
  invocation rather than a step inside a long-lived worker's loop?). This
  is not a configuration change; it is redoing F-03's entire design and
  verification effort.
- **Scheduled jobs / notification escalation / reaper behavior**: Would
  need complete reimplementation, most plausibly as a Vercel Cron Job
  hitting a batch-processing API route on a fixed interval — but the
  escalation chain's per-leave-request, arbitrary-delay scheduling
  (ADR-017's whole point, "not fixed-interval cron") is exactly what
  ADR-011 already rejected a pure-cron alternative for. Replacing pg-boss
  with cloud cron reopens a question ADR-011 already closed with a
  reasoned rejection.
- **Operational complexity / long-term maintainability**: Trades one
  well-understood, already-tested mechanism (pg-boss, Postgres-native, no
  new infrastructure) for an unproven-in-this-codebase one, for a system
  ADR-011 itself already characterizes as "MVP/pilot-hostel scale."
- **Verdict**: The existence of serverless infrastructure does not make
  this superior here — it would maximize rework for a benefit (serverless
  hosting for the worker specifically) that neither option A nor B actually
  needs to achieve serverless hosting for the *HTTP* surface, which is the
  part that plausibly benefits from it.

## Decision Criteria Ranking

| Criterion | Option A — Split | Option B — Persistent Host | Option C — Rearchitect |
|---|---|---|---|
| Reliability | Good | Good (identical to today) | Unproven — full re-verification needed |
| pg-boss compatibility | Full | Full (unchanged) | N/A — pg-boss removed |
| Notification reliability | Preserved | Preserved exactly | Must be re-derived from scratch |
| Security | Slightly larger surface | Same as today | New surface, unproven |
| Maintainability | Two surfaces to maintain | One surface (today's shape) | New paradigm to learn/maintain |
| Cost | Comparable, maybe lower at scale | Low, comparable | Comparable, but pays for rework |
| Scalability | Independent scaling (unused benefit today) | Coupled scaling (sufficient at pilot scale) | Serverless scaling (unused benefit given ADR-011's scale framing) |
| Deployment simplicity | Lower (2 pipelines) | Higher (1 pipeline) | Lower (new pipeline + migration) |
| Compatibility with implemented system | High (needs a new entrypoint) | **Highest — zero code change** | Lowest — most code rewritten |
| F-03 crash-recovery compatibility | Preserved | **Preserved exactly** | Must be redesigned and reverified |
| Future observability (F-07) | Two surfaces to instrument | One surface to instrument | New paradigm to instrument |
| F-04 disaster recovery compatibility | Unaffected | Unaffected | Unaffected |

## Decision

**Option B: persistent host for both the Fastify API and the pg-boss
workers, in one Node process, exactly as already implemented and verified
in every prior remediation phase (F-01 through F-04).**

- **API runtime**: Node.js (the exact version pinned by
  `.github/workflows/ci.yml`, F-06), running the existing compiled
  `apps/api/dist/index.js` via its existing `start` script — unchanged.
- **Worker runtime**: The same process, same `startBackgroundWorkers()`
  call — unchanged.
- **Database**: Supabase Postgres (ADR-006), reached via `DATABASE_URL` —
  unchanged.
- **Communication path**: In-process function calls between Fastify route
  handlers and `JobScheduler` (as today); pg-boss workers communicate with
  Postgres directly, not through the HTTP layer — unchanged.
- **Deployment mechanism**: GitHub Actions (ADR-013's CI/CD clause,
  unaffected by this ADR) builds and deploys the compiled `apps/api` to a
  **persistent-process-capable host** — a platform-as-a-service or
  container host that runs a long-lived Node process (e.g. Render, Fly.io,
  Railway, or a self-managed VM/container; the specific vendor is a
  follow-up provisioning decision, explicitly not made by this ADR — see
  "Migration/Implementation Impact"). **Not Vercel**, for `apps/api`
  specifically.
- **Scaling model**: Vertical scaling of the single process (increase
  instance size) as the primary lever at pilot scale; horizontal scaling
  (multiple instances) is possible later without further code change, since
  pg-boss's own singleton-key/conditional-claim design (already relied on
  by F-03) already tolerates multiple concurrent worker instances safely.
- **Failure isolation**: Accepted as today's existing, already-accepted
  coupling (ADR-011's own "operational simplicity" framing) — not
  worsened, not improved, by this decision.

**Why this is preferable to the other two options**: Option B is the only
option requiring **zero changes to already-implemented, already-tested
application code** — it changes exactly one thing (the deployment target)
and one ADR clause (ADR-013's Vercel-for-backend selection). It fully
preserves F-03's crash-recovery guarantees and F-04's disaster-recovery
posture without re-verification, and it does not reopen ADR-011's
already-reasoned rejection of cloud-cron-only scheduling (which Option C
would effectively do). Option A is a reasonable, lower-risk-than-C
alternative that remains available later if API and worker load profiles
genuinely diverge enough to justify independent scaling/deployment — but at
this system's explicitly-stated MVP/pilot scale (ADR-011), that benefit is
speculative today, and paying its operational-complexity cost now is not
justified by "the chosen architecture must minimize unnecessary rework to
the already implemented Parent application" (this task's own ranking
instruction). Option C is rejected outright: it maximizes rework, reopens a
already-settled ADR-011 question, and requires re-deriving F-03's
crash-recovery guarantees from first principles for no evidenced benefit at
current scale.

## Deployment Implications

`apps/api` moves from an unresolved "Vercel" assumption to an explicit
"persistent-process host" requirement. `.github/workflows/ci.yml` (F-06) is
unaffected — it already builds and tests `apps/api` generically. A future
deployment workflow (not created by this ADR — see F-06's own "no
implementation" instruction, mirrored here) would target whichever specific
host is provisioned, using that host's own deploy mechanism (container
image push, git-based deploy, etc.) rather than Vercel's.

## Security Implications

None beyond what already exists — no new secret categories, no new trust
boundary. Whatever host is chosen must, like today's local environment,
never expose `SUPABASE_URL`/`DATABASE_URL`/`SUPABASE_ANON_KEY` outside its
own environment-variable store (`.claude/rules/security.md`, unchanged).

## Reliability Implications

F-03's crash-recovery design (lease-based claim, minute-cadence reaper,
idempotent redelivery) continues to provide its existing guarantees
unchanged, since nothing about pg-boss's execution model changes. The
single-process coupling between HTTP and worker failure domains is
unchanged from today's already-accepted risk (ADR-011).

## Cost Implications

Lower than Option A (one billable compute unit instead of two) and likely
lower than Option C once C's redevelopment cost is counted. Exact pricing
depends on the specific host chosen, which this ADR does not select.

## Scaling Implications

Sufficient for the MVP/pilot-hostel scale ADR-011 itself already assumes.
Horizontal scaling (multiple worker instances) remains available later
without code changes, since pg-boss's singleton-key/conditional-claim
design already tolerates it.

## Consequences

- ADR-013's backend-hosting clause is superseded; its GitHub/CI-CD,
  Supabase, and EAS clauses stand unchanged.
- `docs/runbooks/production-deployment.md` §2/§9/§11 must be updated to
  reflect a persistent-host requirement instead of Vercel for `apps/api`
  (done by this same task — see the Documentation Changes list).
- No code in `apps/api/src`, `apps/parent-mobile`, migrations, or RLS
  changes as a result of this decision.
- A follow-up provisioning task (not this one) must select a specific host,
  create the account/project, configure its own deploy mechanism, and wire
  its secrets — explicitly out of this ADR's scope, per F-06A's own
  "do not create external hosting projects" instruction.

## Rejected Alternatives

- **Option A (split HTTP/worker)** — rejected for now as unnecessary
  operational complexity at current MVP/pilot scale; remains a legitimate
  future option if load profiles diverge enough to justify it, at which
  point it would build directly on today's already-decoupled
  `buildApp()`/`startBackgroundWorkers()` code shape (finding 5).
- **Option C (rearchitect off pg-boss)** — rejected: reopens ADR-011's
  already-reasoned rejection of cloud-cron-only scheduling, requires
  re-deriving F-03's crash-recovery guarantees from scratch, and maximizes
  rework for a benefit (serverless hosting) this decision achieves for the
  HTTP surface without touching pg-boss at all in Option A, and doesn't need
  at all in Option B.

## Migration / Implementation Impact

- **Specification impact**: None — the SDD does not mandate Vercel
  specifically for the backend beyond naming it in Ch.14's stack table;
  this ADR's supersession is scoped to that one implementation detail.
- **Documentation impact**: `docs/runbooks/production-deployment.md`
  (updated by this task, §9), `docs/current-state.md` (updated by this
  task, §10), `docs/adr/README.md` registry (updated by this task).
- **Code impact**: None at this time. A future provisioning/implementation
  task will add whatever deploy configuration the chosen host requires
  (e.g. a `Dockerfile`/host-specific config), and will need a new,
  narrowly-scoped task of its own.
- **Database impact**: None.
- **API impact**: None — no contract change.
- **Security impact**: None beyond existing requirements (see above).
- **Deployment impact**: `apps/api`'s eventual production deployment target
  changes from "Vercel" to "a persistent-process host" (unnamed vendor).
- **Migration impact**: None required for already-running systems (there is
  no production deployment yet to migrate away from — F-06's own finding).
- **Rollback impact**: This ADR itself is trivially reversible (it changes
  no code); reversing it would mean re-superseding back toward Vercel,
  which would require resolving Option A or C's costs at that time.

## Relationship to F-03

Fully preserved, unchanged, by construction — Option B keeps the exact
pg-boss execution model F-03's crash-recovery design was built and verified
against.

## Relationship to F-04

Unaffected. Database backup/PITR/restore posture is independent of where
the API/worker process runs; it depends only on the Postgres instance
(Supabase), which is unchanged by this decision.

## Relationship to Future F-07 (Observability)

A single persistent process is the simpler of the three options to
instrument initially (one process to attach APM/logging/metrics to). If
API-vs-worker metric separation becomes important later, it can be achieved
via application-level tagging (e.g. a `component` label on log lines) without
requiring Option A's infrastructure-level split.
