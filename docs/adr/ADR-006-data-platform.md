# ADR-006: Data Platform

- **ADR ID:** ADR-006
- **Title:** Data Platform
- **Status:** SUPERSEDED (partially — see note below)
- **Date:** 2026-09-02
- **Superseded by:** ADR-014 (Supabase Auth as Canonical Identity/Authentication Provider) — **only the auth-strategy conclusion below** ("Supabase Auth is explicitly not used... the backend implements its own auth... custom JWT claims"). The data-platform selection (Supabase managed PostgreSQL + Realtime + Storage) is **not** superseded and remains in force, unchanged and unreconsidered by ADR-014.
- **Supersession date:** 2026-09-02
- **Reason for supersession:** the original auth-strategy evaluation treated Supabase Auth as an all-or-nothing replacement for the entire bespoke OTP/device-trust/biometric/attestation flow and rejected it on that basis. ADR-014 re-frames Supabase Auth as the session/token substrate underneath that same bespoke flow (which is fully preserved as Fastify/Postgres-enforced business authorization), removing the original objection. See ADR-014 for full rationale.
- **Related ADRs:** ADR-002 (Database Domain Model — entity naming, unaffected by this), ADR-009 (Realtime Architecture, depends on this), ADR-003 (auth flow this platform must support without owning), ADR-014 (superseding ADR for the auth-strategy portion of this decision).

**The text below is preserved exactly as originally accepted, per the ADR immutability rule — it is historical record, not a current instruction. For the current auth strategy, see ADR-014.**

## Decision

**Supabase (managed PostgreSQL + Realtime + Storage)** is the data platform. **Supabase Auth is explicitly not used** as the primary authentication system — the backend implements its own auth (per ADR-003's bespoke OTP/device-trust/attestation flow) directly against Supabase Postgres, using the `service_role` key for backend-privileged writes and RLS-scoped access with custom JWT claims for any direct client access (e.g. Realtime subscriptions).

## Decision Basis (explicit evaluation, not assumption)

Per the task instruction not to assume Supabase merely because prior documentation mentioned it, this was evaluated fresh against `docs/architecture-requirements.md`:

- **Realtime**: the SDD names **Supabase Realtime** explicitly and repeatedly (Ch.3, Ch.7, Ch.8, Ch.11 §11.9, Ch.13 §13.6) — this is a named requirement, not generic "some realtime mechanism." Building a custom realtime service (WebSocket fan-out, presence tracking, change-data-capture from Postgres) is substantial infrastructure engineering not justified for an MVP/pilot-hostel team.
- **RLS**: a first-class, repeatedly-mandated requirement (SDD Ch.12, Ch.17.3; `.claude/rules/database.md`; `.claude/rules/security.md`). Supabase/Postgres RLS is exactly the mechanism the SDD's security model assumes — this is a genuine capability match, not incidental.
- **Storage**: minor MVP need, covered natively.
- **Migrations**: handled independently via Drizzle (ADR-002's schema layer), not Supabase-specific — no lock-in here.
- **Operational model**: managed Postgres + Realtime + Storage under one control plane meaningfully reduces DevOps burden for a small team, consistent with `docs/deployment.md`'s simple GitHub→Vercel→Supabase pipeline (SDD Ch.14).
- **Vendor coupling** (the real cost): genuine lock-in to Supabase's platform. Accepted because the SDD names it explicitly as part of the target architecture, and the alternative (custom Postgres + custom realtime service) trades vendor coupling for a comparable amount of engineering/operational coupling to in-house infrastructure — not a clearly better tradeoff for this team/project size.

## Options Considered

- **Managed PostgreSQL (e.g. Neon/RDS) + custom backend services** for realtime/storage/auth-adjacent needs — more control, zero vendor lock-in to Supabase specifically, but requires building and operating realtime infrastructure from scratch. Rejected: not justified given Supabase's capability match and the SDD's explicit naming.
- **Supabase (Postgres + Realtime + Storage), Supabase Auth NOT used** — selected, as above.
- **Supabase (Postgres + Realtime + Storage), Supabase Auth used as primary auth** — considered and rejected: the bespoke OTP+device-trust+attestation flow (ADR-003) doesn't map cleanly onto Supabase Auth's standard flows; forcing the fit would add complexity without saving meaningful effort.

## Consequences

- The database connection layer must support both a privileged backend path (service role, for writes/business logic) and an RLS-scoped path (for any direct client reads, e.g. Realtime subscriptions with custom JWT claims).
- RLS policies must be defined per protected table as part of schema implementation (ADR-002's follow-on work), not deferred indefinitely.
- Vendor coupling to Supabase is an accepted, explicit tradeoff — a future move away from Supabase is a material architectural change requiring a superseding ADR with full impact analysis (data migration, realtime replacement, auth path changes).

## Rejected Alternatives

Managed Postgres + fully custom services (realtime infra cost too high for team/project size); Supabase Auth as primary auth (poor fit for the bespoke flow).
