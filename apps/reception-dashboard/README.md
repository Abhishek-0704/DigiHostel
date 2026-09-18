# Reception Dashboard

DigiHostel's Reception Warden / Hostel Administrator / Super Administrator web dashboard (SDD Ch.7; ADR-001; ADR-023). Vite + React + TypeScript SPA.

This is a **scaffolding-only foundation** as of Prompt 0.2 — no business workflow is implemented. See [`docs/architecture.md`](docs/architecture.md) for the full structure and [`docs/reception-dashboard-architecture.md`](../../docs/reception-dashboard-architecture.md) (repo root) for the Prompt 0.1 planning document this scaffold implements.

## Development

```bash
pnpm install
cp apps/reception-dashboard/env.example apps/reception-dashboard/.env.local
pnpm --filter @digihostel/reception-dashboard run dev
```

`apps/api` must be running separately (repo root README) and its CORS configuration must allow this app's dev origin — not yet configured as of this scaffolding pass (`docs/adr/ADR-023`'s Consequences).

## Commands

- `pnpm --filter @digihostel/reception-dashboard run dev` — Vite dev server
- `pnpm --filter @digihostel/reception-dashboard run build` — production build
- `pnpm --filter @digihostel/reception-dashboard run typecheck` — `tsc --noEmit`
- `pnpm run lint` (repo root) — lints this package too (shared flat ESLint config)
- `pnpm run test` (repo root) — runs this package's colocated `*.test.ts` files too (shared root `vitest.config.ts`)

## Environment variables

See [`env.example`](env.example). All are `VITE_`-prefixed (Vite's client-bundle-inlining convention). Never add a non-`VITE_` variable here for anything the app needs at runtime, and never add a service-role key or other backend-only secret.

## Authentication

Staff sign in with **password + mandatory MFA** (Supabase Auth native TOTP — `docs/adr/ADR-024`). Password authentication alone never grants access to a protected route: a session must reach Supabase's own `aal2` assurance level first. See `docs/architecture.md`'s "Authentication & MFA architecture" section for the full state model.

## Status

Not usable yet — no login/MFA UI exists (the mechanism is decided, ADR-024, but Prompt 0.2 is scaffolding only), and only placeholder pages exist for every route.
