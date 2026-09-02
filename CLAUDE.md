# DigiHostel — Claude Code Constitution

DigiHostel is the KIIT Hostel Management System MVP. The attached/compiled SDD is the target design reference; the repository is the implementation source of truth for what currently exists.

## Project references

@workflow.md
@docs/architecture.md
@docs/product.md
@docs/current-state.md
@docs/implementation-baseline.md
@docs/adr/README.md
@docs/api-contract.md
@docs/database.md
@docs/security.md
@docs/testing.md
@docs/integration.md
@docs/deployment.md
@docs/certification.md
@docs/decision-log.md

## Mandatory rules

@.claude/rules/coding.md
@.claude/rules/security.md
@.claude/rules/database.md
@.claude/rules/api.md
@.claude/rules/testing.md
@.claude/rules/git.md
@.claude/rules/dependencies.md

## Skills

Use the relevant skill from `.claude/skills/` for specialized work. Skills are procedural and should be loaded only when useful.

## Agents

Use specialized subagents only when they provide real context isolation or focused review value.

## Non-negotiables

- Inspect before editing.
- Preserve existing architecture unless a major change is explicitly approved.
- Use pnpm for this monorepo.
- Never expose or commit secrets.
- Never bypass authentication, authorization, RLS, or audit requirements for convenience.
- Never edit generated artifacts as the permanent fix when their source generator/spec should be changed.
- Do not destroy unrelated user changes.
- Every task must pass an appropriate test/verification loop before being reported complete.
- Accepted architectural decisions (`docs/adr/`) are authoritative and cannot be silently modified. A contradictory architectural decision requires a new ADR and explicit supersession of the previous ADR before implementation proceeds — see `docs/adr/README.md`.
- The application is implemented from the SDD and approved ADRs. The previous Replit implementation (removed in the 2026-09-02 reset) is not an authoritative baseline for source code, architecture, dependencies, database, API, or UI — see `docs/implementation-baseline.md`.

If the SDD and implementation disagree, do not silently reconcile a material architectural/security/data/API conflict. Report it and explain the impact.
