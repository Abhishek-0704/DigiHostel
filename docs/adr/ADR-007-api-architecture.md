# ADR-007: API Architecture

- **ADR ID:** ADR-007
- **Title:** API Architecture
- **Status:** ACCEPTED
- **Date:** 2026-09-02
- **Related ADRs:** ADR-004 (Mobile Technology — TS client consumes this), ADR-005 (Backend Architecture — Fastify serves this).

## Decision

**REST + OpenAPI as the source contract**, `/api/v1`-prefixed, JSON. Codegen pipeline: **OpenAPI spec → Orval → generated Zod schemas (validation) + generated TanStack Query React client (mobile consumption)**.

## Context

`docs/api-contract.md` and `.claude/rules/api.md` already mandate REST/OpenAPI/`/api/v1`/JSON as governance-level documentation, independent of any specific implementation. This ADR is the independent technology evaluation that arrives at (and formally locks in) the same conclusion — it is not a reuse of the deleted implementation's code; no files are being copied, only a documented convention already present in governance docs before this session's evaluation began.

## Options Considered

- **GraphQL** — flexible querying, single endpoint. Rejected: no requirement anywhere in the SDD calls for flexible/ad-hoc client queries (mobile screens are fixed and well-known per Ch.9/Ch.10's module lists); GraphQL's schema/resolver layer adds complexity with no offsetting benefit here, and REST's one-endpoint-per-operation shape maps more directly onto per-operation RBAC and audit-logging enforcement (SDD Ch.17.1's request lifecycle).
- **Hybrid REST+GraphQL** — unnecessary complexity given no GraphQL-specific requirement exists.
- **REST + OpenAPI** — selected, as above.

For validation/codegen specifically:
- **Ad hoc per-endpoint validation** (hand-written Zod schemas per route, no generation) — rejected: drifts from the OpenAPI spec over time with no automated guarantee of consistency.
- **OpenAPI → Orval → Zod + React Query client** — selected: contract-first, generated artifacts stay in sync with the spec by construction, and directly serves `.claude/rules/coding.md`'s "validate inputs at trust boundaries" and `.claude/rules/api.md`'s regeneration workflow (update spec → regenerate → typecheck → verify consumers).

## Consequences

- `lib/api-spec` (OpenAPI source), `lib/api-zod` (generated Zod), `lib/api-client-react` (generated React Query hooks) become the workspace's shared-package pattern for API contracts (see `docs/workspace-structure.md`) — this is a re-derived convention, not copied code.
- Any API change must go: update OpenAPI spec → regenerate → typecheck affected packages → verify consumers, per `.claude/rules/api.md`. Hand-editing generated files as a permanent fix is prohibited (`.claude/rules/coding.md`).
- A future proposal to adopt GraphQL for any part of the API contradicts this ADR and requires a superseding ADR.

## Rejected Alternatives

GraphQL, hybrid REST+GraphQL, ad hoc validation — as above.
