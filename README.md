# DigiHostel

KIIT Hostel Management System. See `docs/product.md` for the product summary and `sdd/` for the full specification. This repository was reset on 2026-09-02 (`docs/current-state.md`) and is being rebuilt from the specification and the accepted architecture decisions in `docs/adr/`, not from any prior implementation attempt (`docs/implementation-baseline.md`).

## Before touching code

Read, in order: `CLAUDE.md`, `docs/implementation-baseline.md`, `docs/adr/README.md` and every ADR under `docs/adr/`, `docs/target-architecture.md`, `docs/workspace-structure.md`.

## Workspace

pnpm monorepo. See `docs/workspace-structure.md` for the full layout and rationale.

- `apps/api` — backend (Fastify, TypeScript — ADR-005)
- `apps/student-mobile`, `apps/parent-mobile` — mobile clients (Expo/React Native — ADR-001, ADR-004)
- `packages/api-spec`, `packages/api-zod`, `packages/api-client-react` — OpenAPI-first API contract pipeline (ADR-007)
- `packages/db` — Drizzle schema + Supabase connection layer (ADR-002, ADR-006)

## Development

```bash
pnpm install
cp env.example .env   # fill in real values locally; never commit .env
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm test
```

Current implementation status: see `docs/current-state.md`. As of this scaffold, only an infrastructure health-check endpoint exists — no business logic, database schema, or authentication is implemented yet.
