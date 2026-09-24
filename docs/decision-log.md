# Architectural Decision Log

Record only meaningful project-level decisions.

Template:

## ADR-XXX — Title

Date:
Status:

Context:
Decision:

Alternatives considered:

Consequences:

Verification/evidence:

---

## ADR-014 — Supabase Auth as Canonical Identity/Authentication Provider

Date: 2026-09-02
Status: ACCEPTED (supersedes ADR-006's auth-strategy clause only; see `docs/adr/ADR-014-supabase-auth.md`)

Context: ADR-006 originally rejected Supabase Auth in favor of a fully custom Fastify-issued JWT, on the basis that DigiHostel's bespoke OTP/device-trust/biometric/attestation flow didn't map onto Supabase Auth's standard flows. That evaluation treated Supabase Auth as an all-or-nothing replacement rather than as the session/token substrate underneath a still-fully-custom authorization layer.

Decision: Supabase Auth owns identity (`auth.users`) and session/JWT/refresh-token lifecycle. The bespoke OTP/device-trust/biometric/attestation controls remain fully required, re-scoped as Fastify/Postgres-enforced business-authorization gates on top of a valid Supabase session.

Alternatives considered: keep the original custom-JWT design (rejected — reimplements a solved problem, fights RLS/Realtime's native assumptions); let Supabase Auth also own business-authorization decisions like device trust (rejected — no native model for these DigiHostel-specific controls).

Consequences: removes a bespoke JWT-signing secret; RLS/Realtime authorization become native rather than hand-compatible; introduces a new operational requirement (active Supabase session revocation on device removal, not passive expiry).

Verification/evidence: see `docs/adr/ADR-014-supabase-auth.md`'s full supersession impact analysis and `docs/auth-database-security-model.md` for the detailed security model.

---

## ADR-020 — OTP Delivery/Verification Mechanism for Parent Authentication

Date: 2026-09-03
Status: ACCEPTED (mechanism only — SMS-provider selection explicitly left open)

Context: ADR-014 canonicalized Supabase Auth for identity/session issuance but explicitly left open *how* the OTP step in the parent registration flow (SDD Ch.4 §4.2) is delivered/verified — Supabase's own native phone-OTP flow, or a fully custom Fastify-owned OTP system. Flagged as G-19 in the Prompt 0.6 backend audit as a blocker for designing the Parent app's Login/OTP screen.

Decision: Supabase Auth's native phone-OTP flow (`signInWithOtp`/`verifyOtp`) is the OTP mechanism. Fastify never generates, stores, or verifies OTP codes itself. A roll-number-to-parent-record pre-check (new, small, not yet built) must run before the OTP is triggered, so SMS is only ever sent to an already-registered parent's phone number.

Alternatives considered: a fully custom Fastify-owned OTP system (rejected — reimplements a solved problem Supabase Auth already provides, adds a new secret-handling surface for no capability gain); deferring the decision (rejected — it follows directly from already-accepted architecture).

Consequences: the Parent/Student mobile apps' Login/OTP screens are built against the Supabase client SDK directly, not a custom Fastify OTP endpoint; a new Fastify pre-check endpoint is still required (business-authorization concern, not an OTP-mechanism one). Production SMS-provider selection (Twilio/MessageBird/Vonage/an India-specific aggregator) and its cost remain an explicitly open, tracked pre-production decision — not a pre-development blocker, since local Supabase tooling already supports building/testing the flow end-to-end without one.

Verification/evidence: see `docs/adr/ADR-020-otp-delivery-mechanism.md` for the full options analysis and the explicitly-flagged open question.

---

## ADR-022 — Production Backup & Disaster Recovery Strategy

Date: 2026-09-07 (proposed); 2026-09-08 (accepted)
Status: ACCEPTED

Context: F-04 (PRR Phase 13) found the SDD requires PITR unconditionally (Ch.12 §12.7, Ch.16 §16.7) alongside automated daily backups, but no numeric RPO, RTO, or PITR retention period was specified anywhere, and a 2026-09-07 governance review further found that no repository document (`CLAUDE.md`, `workflow.md`, `docs/adr/README.md`, `docs/decision-log.md`, `docs/implementation-baseline.md`) named who was authorized to supply those numbers or accept this ADR — a genuine, unfilled governance gap, not merely an un-exercised one.

Decision: The Product Owner explicitly established themselves as the authority for these DR product decisions and supplied: RPO = 1 hour, RTO = 1–4 hours (a range), PITR retention = 7 days. Target production architecture is Hybrid + PITR — Supabase Pro-tier managed daily backups + PITR at the approved 7-day retention + continued, independent logical backups (`supabase/scripts/backup.mjs`) for off-platform, defense-in-depth coverage. A qualitative scale-up review trigger requires revisiting all of these (RPO, RTO, retention, backup/restore-test frequency, database size, WAL volume, user population, operational criticality, cost) when DigiHostel materially scales or its operational criticality changes — no numeric threshold was defined or invented for that trigger.

Alternatives considered: managed daily backups alone (rejected — no off-platform copy, and doesn't satisfy the SDD's PITR requirement); PITR alone without independent logical backups (rejected — leaves live data and its only backup inside the same Supabase account); a 14-day or 28-day PITR retention tier (both technically available and costed — $200/mo and $400/mo respectively — but not selected; 7 days was the Product Owner's choice, not a cost-minimizing default this ADR inserted).

Consequences: acceptance is a decision-authority/architecture-design milestone only — no production Supabase project exists, PITR has not been enabled anywhere, no backup scheduler or off-site storage has been built, and the approved RPO/RTO have not been operationally demonstrated by any restore drill performed so far. These remain real, tracked implementation/verification gaps, not resolved by this decision.

Verification/evidence: see `docs/adr/ADR-022-production-backup-dr-strategy.md` for the full options analysis, the "Decision authority" before/after governance record, the "PITR Retention Tier Analysis" (7/14/28-day comparison), and the "Not Yet Implemented" list.

---

## ADR-023 — Reception Dashboard Web Framework

Date: 2026-09-14
Status: ACCEPTED

Context: `docs/workspace-structure.md` and `docs/target-architecture.md` both explicitly deferred the Reception Dashboard's web framework choice. Prompt 0.2 (project scaffolding) required a concrete choice to proceed and explicitly pre-authorized Vite+React over Next.js.

Decision: Vite + React + TypeScript SPA, client-side routed, deployed as a static build to Vercel.

Alternatives considered: Next.js (App Router) — rejected, no SSR/SEO requirement to justify it; Remix — rejected, same reason plus no repo precedent.

Consequences: new `apps/reception-dashboard` package; `packages/api-client-react`'s fetch mutator gained a backward-compatible `setApiBaseUrl()` override since it previously only read an Expo-specific env var; `apps/api`'s CORS must be opened for this app's origin (not yet done).

Verification/evidence: see `docs/adr/ADR-023-reception-dashboard-web-framework.md`.

---

## ADR-024 — Reception Dashboard Staff Authentication Mechanism (Password + MFA)

Date: 2026-09-14
Status: ACCEPTED

Context: Prompt 0.1 left the staff authentication mechanism open (`docs/reception-dashboard-architecture.md` §16). A later scaffolding pass supplied an explicit accepted requirement: Password + MFA for Reception Dashboard staff, a stricter posture than the Parent App's OTP flow (ADR-020), justified by the dashboard's higher-privilege administrative surface.

Decision: Supabase Auth password sign-in (`signInWithPassword`) + mandatory Supabase Auth native TOTP MFA (`auth.mfa`). A session counts as authorized only once Supabase's own Authenticator Assurance Level reaches `aal2`. No custom TOTP implementation; no manually-stored secret anywhere in this repository's own schema.

Alternatives considered: magic link (rejected — no natural password step to layer MFA onto, and not what was requested); institutional SSO (rejected — no evidence it exists or is planned); custom/manual TOTP (rejected — reimplements a solved problem and would require storing secrets this application has no business holding).

Consequences: `apps/reception-dashboard`'s auth state architecture (`contexts/authStatus.ts`, `AuthContext.tsx`, `services/auth/mfaService.ts`, `routes/RequireAuth.tsx`) now models `"mfa_required"` as distinct from `"authenticated"`; no login/MFA UI was built (Phase 1/2's work); whether `apps/api` should also enforce `aal2` server-side remains an open implementation question, not decided by this ADR; a staff-provisioning flow (password issuance + MFA enrollment invitation) remains unbuilt.

Verification/evidence: see `docs/adr/ADR-024-reception-dashboard-staff-authentication.md` for the full options analysis; the installed `@supabase/supabase-js@2.113.0`'s MFA API surface was verified directly against its own type declarations, not assumed from documentation memory.

**Update (Prompt 3, RBAC & Authorization Framework)**: this ADR's own Consequences named backend AAL2 enforcement as an open implementation question. It is now implemented — `apps/api/src/lib/auth/guards.ts`'s `requireAal2()`, applied to `POST /leave-requests/:id/expire`, verified against a real local Supabase TOTP enroll+verify round-trip. Not a decision change — an implementation of the already-accepted mechanism, recorded here per this file's own convention of tracking what happened, not by editing the entry above. Staff provisioning and MFA recovery remain open, unaffected.

**Update (Prompt 1, Authentication Infrastructure)**: real `authService.signIn` (password sign-in), administrative inactivity timeout (15 min idle / 2 min warning, INFERRED per SDD Ch.17's qualitative-only requirement, env-overridable), idempotent logout with sign-out-reason tracking, and staff authentication audit logging (new `POST /auth/staff/audit-events`, `apps/api/src/domain/auth/staffAuthAudit.ts`) are all now implemented. CORS (`apps/api/src/app.ts`) changed from a hard `origin: false` to an environment-driven allow-list (`CORS_ALLOWED_ORIGINS`), since a real browser client now exists — no production origin was invented; production still fails closed until configured. Re-verified the full AAL1-blocked/AAL2-permitted chain end-to-end a second time, this time against a real running `apps/api` process rather than only the in-process test harness, and confirmed the resulting audit rows directly in the database. Not a decision change. Staff provisioning and MFA recovery remain explicitly open — not resolved by this update.

**Update (Prompt 2, Login Experience)**: the real login/MFA UI (`apps/reception-dashboard/src/pages/LoginPage.tsx` and `src/components/auth/*`) is now implemented, consuming ADR-024's mechanism and the Prompt 1 infrastructure unchanged — no new authentication mechanism, MFA protocol, or session model was introduced. Re-verified the full chain a third time, this time through the actual rendered UI in a browser (real local Supabase + a real running `apps/api`), including a genuine password→MFA-step-shown-automatically→real-TOTP-verify→AAL2→staff-authorization→dashboard-redirect round trip, both a wrong-password and a wrong-TOTP-code negative path with full UI recovery, and confirmation of the resulting audit rows in `audit_logs`. Not a decision change. Staff provisioning and MFA recovery remain explicitly open — not resolved by this update.

---

## ADR-026 — Interim Production Data-Recovery Risk Acceptance (Partial Supersession of ADR-022)

Date: 2026-09-24
Status: ACCEPTED

Context: Real production infrastructure now exists (Supabase project `asphlfoikqyaeslmhrah`, Render service `digihostel-api-production`, Vercel production frontend) with a real, independently-verified production administrator — but production PITR remains disabled and managed backups remain absent (`pitr_enabled: false`, `backups: []`, re-verified live). ADR-022 required reaching its Option E (Pro + PITR) target before/at production go-live; that has not happened, and the independent QG-06 certification found this undocumented deviation was the sole remaining go-live blocker (F-QG06-01).

Decision: The project temporarily accepts the absence of managed PITR/backups in the live production environment and defers adopting ADR-022's Option E until the already-approved qualitative scale-up trigger (ADR-022) is reached. ADR-022's target architecture, approved RPO/RTO/retention values (1 hour / 1–4 hours / 7 days), and decision-authority finding (Product Owner) are all unchanged — only the "must reach it before/at go-live" expectation is superseded.

Alternatives considered: leaving the verbal decision undocumented (rejected — indistinguishable from an oversight to a future reader); editing ADR-022 or the SDD in place to remove the PITR requirement (rejected — violates this repository's ADR-immutability and SDD-controlled-document rules).

Consequences: F-QG06-01 remains technically open (CRITICAL, unresolved) but is now governed rather than ambiguous — status "TECHNICALLY UNRESOLVED — RISK ACCEPTED / DEFERRED," not "CLOSED." No code, schema, migration, RLS, or security-control change results from this ADR. A future scale-up review must explicitly reconsider this deferral, not only the numeric DR targets.

Verification/evidence: see `docs/adr/ADR-026-interim-production-recovery-risk-acceptance.md` for the full supersession-scope analysis, risk enumeration, and the exact current recovery-capability assessment (`supabase/scripts/backup.mjs` classified AVAILABLE BUT NOT OPERATIONAL, not a production backup system).

---

Initial known decisions:
- Use pnpm as the workspace package manager.
- Keep Supabase architecture.
- Use `@supabase/supabase-js` in `@workspace/api-server`.
- Keep Zod 3.25.76 and configure Orval for Zod 3 output.
- Treat the API/OpenAPI contract as shared infrastructure.
- Preserve a modular-monolith architecture initially.
