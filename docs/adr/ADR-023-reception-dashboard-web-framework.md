# ADR-023: Reception Dashboard Web Framework

- **ADR ID:** ADR-023
- **Title:** Reception Dashboard Web Framework
- **Status:** ACCEPTED
- **Date:** 2026-09-14
- **Related ADRs:** ADR-001 (Client Application Architecture — establishes the Reception Dashboard as a separate web surface, not mobile), ADR-021 (API + pg-boss Worker Runtime Hosting — its Vercel-incompatibility reasoning is backend-process-specific and does not apply to this decision, see Consequences).

## Decision

The Reception Dashboard (`apps/reception-dashboard`) is built as a **Vite + React + TypeScript single-page application**, client-side routed, deployed as a static build to Vercel.

## Context

`docs/workspace-structure.md` and `docs/target-architecture.md` both explicitly deferred this choice ("web framework choice deliberately deferred, no dedicated ADR yet covers it"). The Reception Dashboard Architecture Planning document (`docs/reception-dashboard-architecture.md`, §12) proposed this option without accepting it, pending explicit direction. The Reception Dashboard Prompt 0.2 scaffolding task requires a concrete, buildable choice to proceed and explicitly authorizes this exact option ("If Vite + React is formally accepted, use: React, TypeScript, Vite... Do not introduce Next.js merely because Vercel is being used") — this ADR records that authorization formally, per `docs/adr/README.md`'s process, rather than letting the choice remain silently implicit in a Prompt's own text.

This is a pure engineering/architecture decision (framework/tooling), not a product/business decision (contrast ADR-022, which required explicit Product Owner authority for RPO/RTO/retention numbers) — consistent with how ADR-001/ADR-004/ADR-005/ADR-007 were each accepted directly at the architecture-decision level.

## Options Considered

- **Next.js (App Router)** — capable, Vercel's own framework. Rejected as the primary choice: the Reception Dashboard is an internal, authenticated-only operational tool with no SEO or SSR-content requirement; App Router's server/client component boundary and routing conventions add real complexity with no corresponding payoff here, and no existing repository convention uses it.
- **Vite + React + TypeScript SPA** — selected. No SSR/SEO need to justify the added complexity; natural fit for a realtime-heavy, client-state-heavy operational dashboard (CSR is exactly what this shape of app wants); directly reuses `@digihostel/api-client-react` (React Query hooks, peer-deps only on `react@^19` — no Next.js- or Expo-specific coupling) and `@digihostel/api-zod` without modification; React knowledge already established in this codebase via `apps/parent-mobile`/`apps/student-mobile` (ADR-004) transfers directly; simpler build/dev model, faster iteration for a small team.
- **Remix** — comparable SPA/SSR-hybrid capability to Next.js. Rejected for the same reason as Next.js (no SSR requirement to justify it) plus no existing repository or team precedent.

## Consequences

- New `apps/reception-dashboard` package added to the workspace (`apps/*` glob, `pnpm-workspace.yaml` — no workspace configuration change needed).
- `apps/api`'s CORS configuration (`origin: false` since Prompt 12 RC1, "no browser-based client exists for this API") must be opened for this application's origin(s) — a required, separate implementation change, not made by this ADR.
- `packages/api-client-react`'s fetch mutator (`custom-fetch.ts`) previously read only `process.env.EXPO_PUBLIC_API_BASE_URL`, an Expo-bundler-specific inlining convention with no equivalent in a Vite browser bundle. Extended (backward-compatibly — the Expo apps are unaffected, since they never call the new setter) with a `setApiBaseUrl()` override, mirroring the existing `setAuthTokenProvider()` pattern exactly, so the Reception Dashboard can configure its own base URL via Vite's `import.meta.env.VITE_API_BASE_URL` convention.
- ADR-021's Vercel-incompatibility finding (Fastify + pg-boss needs a persistent process) is specific to `apps/api`'s backend runtime and does not apply here — the Reception Dashboard is a static SPA build with no server process of its own, so Vercel (the SDD's originally-named frontend host, `docs/deployment.md`) remains the correct, unconflicted target for it specifically.
- No new backend service, no new Supabase project, and no schema/RLS change follows from this decision — the dashboard consumes the same `/api/v1` contract and the same Supabase project as the mobile apps (ADR-001's "same backend, same RBAC layer" principle, `docs/target-architecture.md`).
- Router library, CSS approach, and component-testing tooling are lower-stakes implementation details established directly in the scaffolding itself (`apps/reception-dashboard/docs/architecture.md`), not elevated to ADR status, consistent with this project's precedent of not writing an ADR for every routine tooling choice (see `docs/adr/README.md`'s note on ADR-012 not being created for the testing-stack choice).

## Rejected Alternatives

Next.js and Remix, as above — both lose the "simplest tool that fits an SSR-less, internal, realtime-heavy dashboard" property Vite+React provides, without a corresponding requirement to justify their added complexity.
