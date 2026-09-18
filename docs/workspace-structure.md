# Workspace Structure

Derived from `docs/target-architecture.md` and the accepted ADRs. This defines the repository layout for the new implementation — it is not a restoration of the deleted Replit implementation's layout (see naming rationale below).

## Structure

```
DigiHostel/
├── apps/
│   ├── api/                  Fastify backend (ADR-005) — the single backend serving all clients
│   ├── student-mobile/       Student mobile app, Expo/React Native (ADR-001, ADR-004)
│   ├── parent-mobile/        Parent+Guardian mobile app, Expo/React Native (ADR-001, ADR-004)
│   └── reception-dashboard/  Reception Warden/Hostel Admin/Super Admin web dashboard,
│                             Vite+React+TS SPA (ADR-001, ADR-023) — scaffolding only as of
│                             Prompt 0.2, no business workflow implemented yet; see
│                             apps/reception-dashboard/docs/architecture.md
│
├── packages/
│   ├── api-spec/              OpenAPI source contract + Orval config (ADR-007)
│   ├── api-zod/                Generated Zod schemas (ADR-007, generated — do not hand-edit)
│   ├── api-client-react/       Generated React Query hooks, consumed by both mobile apps (ADR-007)
│   └── db/                     Drizzle schema, migrations, Supabase connection layer (ADR-002, ADR-006)
│
├── tests/
│   └── e2e/                    Cross-app E2E flows (Playwright for web, Maestro for mobile) —
│                                per-package unit/integration tests are colocated in each
│                                apps/* or packages/* package instead, not centralized here
│
├── docs/                       Governance, SDD reference, ADRs, architecture docs (already exists, preserved)
├── sdd/                        Specification source (already exists, preserved, untouched)
├── .claude/                    Claude governance (already exists, preserved)
│
├── package.json                Workspace root manifest
├── pnpm-workspace.yaml          Workspace package globs + pnpm supply-chain policy
├── tsconfig.base.json           Shared TypeScript project-reference base
├── .gitignore                   (already exists, reset-cleaned)
├── .env.example                 Placeholder-only environment variable reference
└── README.md                    Development instructions
```

## Naming Rationale (why this differs from the deleted implementation's layout)

- **`apps/` instead of `artifacts/`**: `artifacts/` is Replit-specific terminology — the deleted implementation's own `.replit-artifact/artifact.toml` sentinel files confirm this was a Replit platform convention, not a deliberate project choice. `apps/` is the standard term used across the pnpm/Turborepo/Nx monorepo ecosystem for deployable applications, independent of any specific host platform.
- **`packages/` instead of `lib/`**: `packages/` is the more conventional term for shared, non-deployable workspace packages in the pnpm ecosystem (matches pnpm's own documentation examples). `lib/` was a reasonable but less standard choice; this is a genuine, independently-motivated naming improvement, not change for its own sake.
- **Leaf package names retained** (`api-spec`, `api-zod`, `api-client-react`, `db`): these are generic, descriptive names for generic, descriptive concepts (an OpenAPI spec package, a generated-Zod package, a generated-client package, a database package) — renaming them for the sake of difference would be churn without benefit. No code from the deleted packages is reused; only the naming convention for "a package that holds the OpenAPI spec" is the same, because that is simply the correct name for that concept regardless of which implementation attempt built it.
- **No `scripts/` at root**: the deleted implementation's `scripts/` package (a `hello.ts` smoke test and a `post-merge.sh` git hook) is not recreated because nothing in the new architecture currently requires a standalone scripts workspace package — tooling scripts, if needed later, can live in `package.json` script fields or a package-specific `scripts/` subdirectory without needing their own top-level workspace package. This is a deliberate omission, not an oversight.
- **`tests/e2e/` is new**: the deleted implementation had no test infrastructure at all. This directory exists because `docs/technology-decision-matrix.md` selected a concrete E2E stack (Playwright, Maestro) that needs a home; per-package unit/integration tests stay colocated with their source (standard Vitest convention), not centralized.
- **No `supabase/` CLI directory yet**: migrations are owned by Drizzle (`packages/db`), per the existing governance convention in `.claude/rules/database.md`, not Supabase CLI's own migration system. A `supabase/` directory may be added later only if local Supabase CLI tooling (e.g. local dev stack) is adopted — not assumed now.
- **No dedicated `infra/` directory yet**: deployment configuration (`vercel.json`, `eas.json`) lives within the specific `apps/*` package it configures, consistent with Vercel/EAS convention — no cross-cutting infrastructure-as-code exists yet at MVP scale.

## Build Output & Runtime Resolution

`apps/api`'s compiled runtime (`node apps/api/dist/index.js`, no TypeScript loader) must resolve any internal workspace package it imports at runtime through that package's plain `dist/` JavaScript output — never its TypeScript source. Only one internal package is currently consumed at runtime by `apps/api`: **`@digihostel/db`** (`@digihostel/api-zod` is a declared dependency but not actually imported by any `apps/api` source file today — it has the same latent source-path issue but is out of scope until it's actually consumed at runtime).

- **Runtime-built package**: `packages/db`. Its `package.json` declares `main`/`types`/`exports` pointing at `./dist/index.js` / `./dist/index.d.ts` — never `./src/...`. Build via `pnpm --filter @digihostel/db run build` (`tsc -p tsconfig.json`, `composite: true` so it can also be consumed via TS project references — `apps/api/tsconfig.json` lists it under `references`).
- **Not runtime-built (by design)**: `packages/api-spec` (no runtime import — OpenAPI source + codegen script only), `packages/api-zod`/`packages/api-client-react` (consumed, if at all, by mobile apps via Metro's own bundler, which handles TS directly — not by any Node-runtime consumer, so `main`/`types` pointing at `./src/index.ts` is fine for them today).
- **Workspace build order**: the root `build:libs` script (`pnpm --filter @digihostel/db run build`) always runs before any dependent package's typecheck or build — both `pnpm run typecheck` and `pnpm run build` call it first. This is explicit, not implicit: `pnpm -r` was confirmed (empirically, while diagnosing this issue) to run workspace packages concurrently rather than in dependency order, so relying on plain `pnpm -r --if-present run build` alone is not sufficient once a package's package.json points at compiled output that another package's typecheck needs to resolve.
- **Production runtime verification**: `apps/api/scripts/verify-workspace-package-resolution.mjs`, run via plain `node` (not vitest — vitest's transform pipeline can execute `.ts` directly, which would silently mask exactly the regression this script exists to catch). It dynamically resolves each runtime-consumed internal package, asserts the resolved path is a `.js` file under `dist/`, and asserts expected exports are present. Wired into `pnpm run build` (via `apps/api`'s `verify:runtime-resolution` script) so every build re-proves this automatically; fails loudly if `main`/`exports`/`types` ever revert to an unbuilt source path (verified directly during this fix by temporarily reverting `packages/db/package.json` and confirming the script fails).

## Deferred/Not Yet Justified

- `packages/config` (shared lint/tsconfig presets as their own package) — not created yet; root-level `tsconfig.base.json` is sufficient at current package count. Revisit if config duplication across packages becomes a real maintenance burden.
