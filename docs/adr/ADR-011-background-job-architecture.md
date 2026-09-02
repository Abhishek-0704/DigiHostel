# ADR-011: Background Job Architecture

- **ADR ID:** ADR-011
- **Title:** Background Job Architecture
- **Status:** ACCEPTED
- **Date:** 2026-09-02
- **Related ADRs:** ADR-006 (Data Platform — the Postgres instance this reuses), ADR-010 (Notification Architecture — primary consumer).

## Decision

**pg-boss**, a Postgres-native job queue running on the existing Supabase Postgres instance (ADR-006). Used for: per-request escalation timers (each step of the Father→Mother→Guardian→In-app call→Manual chain), notification delivery retries.

## Context

The escalation chain (SDD Ch.5) requires per-leave-request scheduled state transitions (e.g., "if Father hasn't responded within N minutes, notify Mother"), which needs per-row scheduling, not fixed-interval cron. Notification retries similarly need delayed, retryable job execution.

## Options Considered

- **pg-boss on existing Postgres (selected)** — no new infrastructure component: reuses the Postgres instance already required for everything else (ADR-006), directly serving the "operational simplicity" and "minimum dependency set" priorities (Phase 10 dependency policy). Sufficient throughput for MVP/pilot-hostel scale (a bounded number of concurrent leave requests and checkpoint events, not high-frequency job volume).
- **BullMQ + Redis** — higher throughput ceiling and a more feature-rich job-queue API, but introduces a new infrastructure component (Redis) and a new secret/connection to manage, for headroom this project doesn't currently need.
- **Cloud provider cron (e.g. Vercel Cron)** — sufficient for fixed-interval maintenance tasks, but cannot express "schedule this specific timeout for this specific leave request" without building a scheduling layer on top anyway, which is what pg-boss already provides.

## Consequences

- No Redis dependency is introduced. If job volume ever exceeds what pg-boss/Postgres can comfortably handle, that is a capacity signal requiring a superseding ADR (with impact analysis per `docs/adr/README.md`) before migrating to a dedicated queue like BullMQ+Redis — not a default assumption today.
- Escalation-timer and notification-retry jobs must be idempotent (re-running a job that already completed must not double-notify), consistent with `.claude/rules/database.md`'s "consider idempotency for approvals" guidance.

## Rejected Alternatives

BullMQ+Redis (unjustified infra cost at current scale), cloud cron alone (insufficient for per-row scheduling).
