# ADR-005: Backend Architecture

- **ADR ID:** ADR-005
- **Title:** Backend Architecture
- **Status:** ACCEPTED
- **Date:** 2026-09-02
- **Related ADRs:** ADR-004 (Mobile Technology — TypeScript-sharing rationale), ADR-006 (Data Platform), ADR-007 (API Architecture).

## Decision

The backend will be built in **TypeScript on Node.js, using Fastify** as the HTTP framework, as a modular monolith (per `docs/architecture.md`, unchanged by this ADR).

## Context

Candidates: TypeScript+Node.js (Express or Fastify), Go. Full evaluation in `docs/technology-decision-matrix.md`.

## Options Considered

- **Go** — strong concurrency and security properties, static binaries, smaller dependency surface. Rejected: no type-sharing with the TypeScript mobile clients (ADR-004), smaller/less mature Supabase client ecosystem, and would fragment the team across two languages with no requirement-driven benefit — this system is I/O-bound (API + DB + realtime), not CPU-bound, so Go's concurrency advantage isn't decisive here.
- **Express (TypeScript)** — mature, ubiquitous, was used in the deleted implementation (that fact carries no weight either way per `docs/implementation-baseline.md`'s clean-start rule). Considered seriously; rejected in favor of Fastify because Fastify's schema-first request/response validation model, expressed as named lifecycle hooks (`onRequest`, `preHandler`, etc.), maps more directly onto the required request pipeline (TLS → Auth → RBAC → business logic → DB → realtime → audit → response, SDD Ch.17.1) than Express's more ad hoc middleware chain, and has first-class TypeScript typing without `@types/express` friction.
- **Fastify (TypeScript)** — selected. Native TS support, schema-hook validation model fits the trust-boundary validation requirement (`.claude/rules/coding.md`) directly, strong plugin ecosystem, structured logging (pino) built in.

## Consequences

- API routes will be organized as Fastify plugins/hooks, not Express middleware chains.
- Zod integration for request/response validation happens via Fastify's schema-validation hook points, feeding the OpenAPI-first contract strategy (ADR-007).
- Any future proposal to switch backend language or framework (e.g., to Go, or to Express) contradicts this ADR and requires a superseding ADR with migration/compatibility impact analysis per `docs/adr/README.md`.

## Rejected Alternatives

Go and Express, as above.
