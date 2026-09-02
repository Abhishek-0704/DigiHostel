# Dependency Rules

This is a pnpm monorepo.

Use pnpm only:
`pnpm --filter <package> add <dependency>`

Do not use npm for workspace dependency installation.

The application implementation was reset (see `docs/current-state.md`, `docs/implementation-baseline.md`). No dependency baseline currently exists — do not assume Node, TypeScript, Zod, Express, Supabase, or any other version from the deleted implementation still applies. Establish and record the actual baseline in `docs/current-state.md` when dependencies are first chosen.

Do not upgrade unrelated dependencies during feature work.
