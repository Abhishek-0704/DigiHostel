# ADR-009: Realtime Architecture

- **ADR ID:** ADR-009
- **Title:** Realtime Architecture
- **Status:** ACCEPTED
- **Date:** 2026-09-02
- **Related ADRs:** ADR-006 (Data Platform — Supabase selection this depends on).

## Decision

**Supabase Realtime**, using **Postgres Changes** (row-level change feed) for state-table-driven updates — `leave_requests`, `journey_events`, `notifications` — and **Broadcast channels** for transient/ephemeral events, specifically incident escalation alerts (SDD Ch.2 FR-012, Ch.6) that don't correspond to a durable row change worth subscribing to directly.

## Context

The SDD names Supabase Realtime explicitly and consistently across Ch.3, Ch.7, Ch.8, Ch.11 §11.9, and Ch.13 §13.6, and explicitly rejects client polling ("Supabase Realtime minimizes polling," Ch.11 §11.9). Required realtime surfaces: parent approval status, library journey status, notifications, Reception/Library dashboard updates, incident escalation.

## Options Considered

- **Supabase Realtime (selected)** — matches the SDD's named requirement directly; Postgres Changes gives durable, RLS-respecting subscriptions on the actual tables driving approval/journey state, with no separate event-publishing code path to keep in sync with the database; Broadcast covers events that aren't naturally "a row changed" (e.g., an escalation ping that should reach a Reception dashboard immediately without waiting on a table write).
- **Custom WebSocket service (e.g. Socket.IO on the Fastify backend)** — full control over message shape and delivery guarantees, but duplicates infrastructure Supabase already provides, adds an operational component to run/scale/monitor, and contradicts the SDD's explicit naming with no offsetting requirement.
- **Polling** — explicitly rejected by the SDD itself.

## Consequences

- Realtime authorization flows through the same RLS policies as regular reads (ADR-006) — a client only receives Postgres Changes events for rows it's authorized to see, which must be verified during RLS policy design, not assumed.
- Broadcast-channel events (escalation alerts) are not persisted by the realtime layer itself — any durability requirement for escalation events must come from the underlying `notifications`/`audit_logs` writes (ADR-002), with Broadcast purely as the low-latency delivery path.
- A future move to a custom realtime service is a material change requiring a superseding ADR.

## Rejected Alternatives

Custom WebSocket service, polling — as above.
