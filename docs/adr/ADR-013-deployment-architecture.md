# ADR-013: Deployment Architecture

- **ADR ID:** ADR-013
- **Title:** Deployment Architecture
- **Status:** ACCEPTED (backend-hosting clause only superseded — see notice below)
- **Date:** 2026-09-02
- **Superseded by:** ADR-021 (backend-hosting clause only — "Vercel (backend/web hosting)" as it applies to `apps/api`; the GitHub/CI-CD, Supabase, and EAS clauses below are unaffected and remain in force)
- **Related ADRs:** ADR-004 (Mobile Technology — EAS follows from Expo), ADR-006 (Data Platform — Supabase), ADR-011 (Background Job Architecture — the pg-boss requirement ADR-021 reconciles this ADR's Vercel choice against), ADR-021 (API + pg-boss Worker Runtime Hosting — supersedes this ADR's backend-hosting clause).

> **Supersession notice (2026-09-06, F-06A):** the "Vercel (backend/web hosting)" decision below was never evaluated against ADR-011's pg-boss requirement at the runtime/process level. ADR-021 found that `apps/api`'s Fastify HTTP server and pg-boss background workers share one persistent Node process, which Vercel's serverless execution model cannot host. ADR-021 supersedes only this specific clause; every other decision in this ADR (GitHub + GitHub Actions for CI/CD, Supabase for database/realtime/storage, EAS for mobile builds) stands unchanged.

## Decision

**GitHub** (source control + GitHub Actions for CI/CD) → **Vercel** (backend/web hosting) → **Supabase** (database/realtime/storage), matching the SDD's deployment chapter directly. **EAS (Expo Application Services)** is added for mobile app builds and OTA updates, as a direct, necessary consequence of ADR-004 (Expo) rather than an independent deployment choice. **Replit** remains a development-only tool (per SDD Ch.1, Ch.3 §3.6, Ch.14 §14.2), explicitly not part of the production pipeline.

## Context

SDD Ch.14 §14.4 specifies: Developer push → GitHub → automated build/test → Vercel → Supabase connection → health checks → production release, with branches `main`, `develop`, `feature/*`, `hotfix/*`, `release/*`. This ADR locks that in as the implementation decision and adds the one piece the SDD doesn't cover: mobile app distribution, which requires EAS given the Expo choice.

## Options Considered

- **GitHub Actions + Vercel + Supabase + EAS (selected)** — matches the SDD's explicit specification (SDD-compliance priority #2) with no requirement-driven reason to deviate; EAS is the standard, necessary complement to an Expo-based mobile stack (ADR-004) for app-store builds and over-the-air JS updates.
- **AWS/GCP/self-hosted** — more infrastructure control, no vendor coupling, but directly contradicts the SDD's explicit deployment specification with no offsetting requirement identified during evaluation.
- **A different CI provider than GitHub Actions** — no reason to introduce a second vendor when GitHub is already the source-control platform.

## Consequences

- Environment separation follows the SDD's branch model (`main`/`develop`/`feature/*`/`hotfix/*`/`release/*`).
- Observability at this stage is structured logging (pino) plus Supabase/Vercel's built-in dashboards; a dedicated APM/error-tracking tool (e.g. Sentry) is recommended for early implementation but not part of this ADR's scaffolding-time scope (see `docs/technology-decision-matrix.md`).
- Secrets (Supabase service role key, EAS credentials, push credentials) are managed as environment variables / platform secret stores, never committed — per `CLAUDE.md` and `.claude/rules/git.md`.

## Rejected Alternatives

AWS/GCP/self-hosted — contradicts the SDD's explicit specification with no requirement-driven justification found.
