# Target Architecture

Describes the NEW system only, per the decisions recorded in `docs/adr/` (ADR-001 through ADR-011, ADR-013, ADR-014) and `docs/technology-decision-matrix.md`. The deleted Replit implementation is not reflected here in any form — see `docs/implementation-baseline.md`.

> **2026-09-02 correction**: authentication architecture changed — Supabase Auth is now the canonical identity/session provider (ADR-014, superseding ADR-006's auth-strategy clause only). See `docs/auth-database-security-model.md` for the full model. All references to "backend-issued JWT" below are corrected to reflect this.

## System Topology

```
Student App (React Native/Expo, TS)              Parent + Guardian App (React Native/Expo, TS)
        │  REST /api/v1 (OpenAPI-generated client, ADR-007)     │
        │  Supabase Realtime subscription (ADR-009)             │
        ▼                                                       ▼
                    Backend / API (Fastify, TypeScript, ADR-005)
                    ┌─────────────────────────────────────────┐
                    │ Auth verification (Supabase JWT) +        │  ADR-014
                    │ business authorization (device-trust,     │  ADR-003, ADR-014
                    │ attestation, biometric-freshness gates)   │
                    │ RBAC middleware                           │  SDD Ch.17.1
                    │ Leave/Approval service                    │  SDD Ch.5
                    │ Library/QR service                        │  SDD Ch.6
                    │ Notification orchestration                │  ADR-010
                    │ Background jobs (pg-boss)                 │  ADR-011
                    │ Audit logging                             │  SDD Ch.12
                    │ SAP scraping worker (MVP)                 │  SDD Ch.1/2/3/5/11
                    └─────────────────────────────────────────┘
                                      │
                                      ▼
                    Supabase (PostgreSQL + Realtime + Storage)     ADR-006
                    ┌─────────────────────────────────────────┐
                    │ students, parents, trusted_devices,       │  ADR-002
                    │ leave_requests, approvals, library_passes,│
                    │ journey_events, qr_sessions, notifications,│
                    │ audit_logs, security_incidents            │
                    └─────────────────────────────────────────┘

Reception / Library / Admin web dashboards (React, TS — separate client surface, SDD Ch.3/7/8)
        │  REST /api/v1 (same backend, same RBAC layer)
        ▼
                    Backend / API  (same instance as above)
```

Both mobile apps and the web dashboards are independent clients of the same backend/API — there is one backend, multiple clients, per ADR-001's role-separated client model.

## Major Components

- **Mobile applications** (ADR-004): Student App, Parent+Guardian App. React Native/Expo, TypeScript. Consume the generated API client (ADR-007) and Supabase Realtime directly (read-only, RLS-scoped) for live updates.
- **Reception/Library/Admin web dashboards**: separate React web client(s), not part of this ADR set's mobile decisions but consuming the same backend/API and RBAC model. (Not yet subject to a dedicated ADR — web framework choice is deferred to when dashboard implementation begins, since no dashboard-specific requirement was in scope for this phase.)
- **Backend/API** (ADR-005, ADR-007): Fastify, TypeScript, modular monolith (`docs/architecture.md`, unchanged). Owns all business logic, RBAC enforcement, audit writes, and orchestration.
- **Database** (ADR-002, ADR-006): Supabase PostgreSQL, canonical entity set per ADR-002, RLS-enforced.
- **Authentication** (ADR-014): Supabase Auth is the canonical identity/session provider — issues and manages JWTs/refresh tokens for `auth.users`. The bespoke OTP-gated roll-number verification, trusted-device registration, platform attestation, and biometric confirmation (ADR-003) remain fully required, re-scoped as Fastify/Postgres-enforced business-authorization gates layered on top of a valid Supabase session — see `docs/auth-database-security-model.md`.
- **Authorization**: two layers — (1) Fastify business authorization (device-trust/attestation/biometric-freshness checks, RBAC for the 7-role model, SDD Ch.2 §2.2), enforced server-side, never trusting client-supplied claims beyond coarse role; (2) PostgreSQL RLS as the final database-level authorization boundary, per `docs/auth-database-security-model.md`.
- **Device trust**: `trusted_devices` table + platform attestation (Play Integrity/App Attest) gate, per ADR-003.
- **Realtime** (ADR-009): Supabase Realtime — Postgres Changes for state tables, Broadcast for transient escalation events.
- **Notification service** (ADR-010): Expo Push delivery, backend-owned escalation orchestration.
- **Background jobs** (ADR-011): pg-boss on the Supabase Postgres instance — escalation timers, notification retries.
- **QR service**: backend-generated, signed, 30–60s-TTL, one-time-use QR sessions (SDD Ch.6 §6.3, Ch.17.3), validated against `qr_sessions`/`journey_events`.
- **SAP integration**: MVP web-scraping worker (SDD Ch.1/2/3/5/11) — isolated as its own backend component given its inherent fragility, not embedded directly in request-handling paths.
- **Audit system**: writes to `audit_logs` from every module (SDD Ch.12 "All modules → Audit Logs").
- **Observability**: pino structured logging + Supabase/Vercel dashboards at MVP stage (`docs/technology-decision-matrix.md`).
- **Deployment infrastructure** (ADR-013): GitHub Actions (CI) → Vercel (backend hosting) → Supabase (data platform); EAS for mobile builds/OTA.

## Trust Boundaries

- **Mobile → Backend**: crosses the public internet; every request must pass TLS → Supabase JWT verification (ADR-014) → Fastify business authorization (device-trust/attestation/biometric-freshness) → RBAC → business validation, per SDD Ch.17.1. The mobile client is never trusted for role or ownership claims, and never trusted merely because it presents a valid JWT (ADR-014).
- **Backend → Database**: two distinct trust levels — (a) backend service-role connection, fully privileged, used for all business-logic writes; (b) any direct client-to-Supabase path (Realtime subscriptions, authenticated with the client's own Supabase session) is RLS-scoped and must never carry write privileges.
- **Backend → External services**: SAP scraping target (untrusted, fragile, isolated per above), Expo Push service, telecom infrastructure (only if/when SNA is adopted post-MVP per `docs/research/sim-verification-feasibility.md` — not in MVP scope).
- **SAP integration boundary**: treated as an untrusted, unreliable external system — scraping failures must not cascade into leave-approval-flow failures; this worker's output should be validated/sanitized before being trusted as SAP data.
- **Notification boundary**: outbound only from backend to Expo Push; delivery status read back is data, not a trust escalation.
- **Administrative boundary**: Reception/Library/Admin dashboard users pass through the same RBAC layer as mobile users — no separate, weaker authorization path for administrative roles. Warden/Admin roles never gain parent approval authority (ADR-003's context, SDD Ch.5/Ch.7 clarification).

## Data Flow

- **Parent authentication**: Parent app → Roll Number lookup → OTP (delivery mechanism unresolved, see `docs/auth-database-security-model.md`) → **Supabase Auth session established** (ADR-014) → platform attestation check (ADR-003) → trusted-device registration → biometric enrollment. SIM verification: not present in MVP (see research doc).
- **Leave approval**: Student/Reception initiates → `leave_requests` row created → notification to Father (Expo Push, ADR-010) → escalation timer (pg-boss, ADR-011) → on timeout or explicit decline, notify Mother → then Guardian → then in-app call flag → then manual verification queue (Reception) — matching SDD Ch.5's state machine exactly. Each parent decision requires biometric confirmation client-side before the approve/reject request is sent.
- **Escalation**: driven by pg-boss-scheduled jobs per leave request; each step writes to `audit_logs` and updates `leave_requests`/approval state (naming/granularity per ADR-002, finalized at schema-implementation time).
- **Library pass / QR verification**: student requests pass → backend creates `library_passes` + `qr_sessions` row (signed, 30–60s TTL) → Student app displays QR → Reception/Library scans → backend validates signature+expiry+one-time-use → biometric confirmation required at each checkpoint → `journey_events` row written → Supabase Realtime broadcasts to Reception/Library dashboards.
- **Biometric verification**: always client-side (device OS biometric API), never transmitted to the backend — only the resulting "biometric confirmed" assertion (bound to the specific approval/checkpoint action) is sent.
- **Realtime updates**: backend writes to state tables → Supabase Postgres Changes fan out to subscribed clients, authenticated via their own Supabase Auth session (ADR-014) and RLS-scoped (parent's own leave requests, student's own journey, Reception/Library's operational view) → transient escalation alerts additionally go via Broadcast, authorized per-channel via RLS policies on `realtime.messages` for private channels (see `docs/auth-database-security-model.md`).
- **Notifications**: backend orchestration (ADR-010) → Expo Push → mobile client; delivery status written back to `notifications`.
- **Audit events**: every state-changing operation across every module writes an `audit_logs` entry, per SDD Ch.12's "All modules → Audit Logs" relationship — this is enforced at the backend service layer, not left to individual route handlers to remember.

No implementation code is included in this document, per Phase 7's instruction.
