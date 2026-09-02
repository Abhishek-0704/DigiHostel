# ADR-008: Offline Sync Architecture

- **ADR ID:** ADR-008
- **Title:** Offline Sync Architecture
- **Status:** ACCEPTED
- **Date:** 2026-09-02
- **Related ADRs:** ADR-004 (Mobile Technology), ADR-007 (API Architecture — TanStack Query client).

## Decision

Client-side offline persistence via **`expo-sqlite`** for a persisted outbound-action queue, paired with **TanStack Query's cache** for server-state. Conflict resolution policy: **server-authoritative** — the server is always the source of truth for state transitions (approval status, journey status); queued client actions replay against the server on reconnect; optimistic UI updates revert if the server rejects the replayed action.

## Context

SDD Ch.9 §9.2 and Ch.10 §10.2 both require an "Offline Sync" client module with local encrypted storage and an offline event queue, but — confirmed during this session's SDD conflict sweep — **no chapter specifies a conflict-resolution mechanism**. This is a genuine specification gap, not a contradiction between chapters, and left the architecture undefined unless explicitly decided here.

## Options Considered

- **Server-authoritative, queue-and-replay** (selected) — client queues actions taken while offline (e.g., a parent's approve/reject tap, a student viewing cached leave status) and replays them against the server on reconnect. The server's response is final; any conflict (e.g., a leave request already expired or resolved by another escalation step) is surfaced to the user rather than silently merged. This fits the domain: approvals and journey checkpoints are safety/security-relevant state transitions (SDD Ch.5, Ch.6) where silent automatic conflict resolution would be actively dangerous — an approval decision must never be merged or guessed.
- **Bidirectional multi-writer sync (WatermelonDB/RxDB-style, with vector clocks or CRDTs)** — powerful, but this domain doesn't have genuine multi-writer conflicts (only one parent approves a given leave request; only one device performs a given checkpoint scan) — the added complexity of a general-purpose sync engine isn't justified by the actual data-mutation pattern.
- **No offline queueing, read-only offline cache only** — rejected: contradicts the SDD's explicit "Offline Sync" module requirement in both mobile chapters.

## Consequences

- Mutating actions taken offline (approve/reject, checkpoint scans initiated offline) are queued locally and only take effect once the server confirms them — the UI must clearly communicate "pending sync" state, not assume success.
- Read data (leave status, library pass, notifications) is cached via TanStack Query's persistence and can be served stale-while-revalidating when offline.
- No CRDT/vector-clock infrastructure is needed, keeping the client dependency footprint minimal (Phase 10 dependency policy).
- If a future requirement introduces genuine multi-writer offline conflicts (not currently the case), this decision must be revisited via a superseding ADR.

## Rejected Alternatives

Bidirectional multi-writer sync engines (unjustified complexity); read-only offline (contradicts SDD).
