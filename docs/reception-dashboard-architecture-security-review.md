# Reception Dashboard — Architecture & Security Review (ASRB, Prompt 0.3)

**Review timing**: after Prompt 0.1 (planning) and Prompt 0.2 (scaffolding + MFA foundation). No business feature, login UI, or MFA UI exists. This is a certification review of the foundation only — it does not implement, modify, or redesign anything. All findings below were produced by direct inspection of the repository during this review (file reads, greps, and targeted checks), not from memory of the two prior sessions' own summaries.

---

## 1. Executive Summary

The foundation is architecturally sound, correctly scoped, and does not conflate the SAP/hostel-leaving/parent-approval domains anywhere (there is no leave-domain code at all yet — only typed interfaces — so there is nothing to conflate). Dependency versions are consistent with `apps/parent-mobile`. No service-role key or other backend-only secret exists in the new app. The scaffold reuses `@digihostel/api-client-react`/`@digihostel/api-zod` without duplication and required exactly one small, justified, backward-compatible shared-package change.

This review surfaced **no BLOCKER**, but **two CRITICAL and several MAJOR findings**, all found through direct code inspection, not carried over uncritically from the prior two sessions' own self-reporting:

1. **`apps/api` has zero AAL/AMR awareness anywhere in its codebase** (verified: `grep -n "aal\|amr\|assurance" apps/api/src/lib/auth/{jwt,guards,types}.ts` → no matches). This was already named as an open question in ADR-024; this review confirms it as a *concrete, currently-exploitable gap in the making* — not merely a hypothetical — once any staff-facing Fastify route exists. CRITICAL.
2. **`RequireAuth`'s authorization check is structurally a deny-list, not an allow-list** (`apps/reception-dashboard/src/routes/RequireAuth.tsx:44-48`): it explicitly redirects known-bad statuses and falls through to `return children` for anything else, rather than explicitly requiring `status === "authenticated"`. Today this is logically equivalent (TypeScript's `AuthStatus` union has exactly 5 members, all enumerated), but it is fragile-by-construction: a 6th status added later without updating this exact file would silently authorize instead of denying. MAJOR (not CRITICAL — zero practical exploitability today).
3. **No component/DOM-level test harness exists anywhere in this workspace** (verified: only one `*.test.ts` file exists under `apps/reception-dashboard/src`, and it is pure-logic; no `jsdom`/Testing Library dependency in `package.json`). Prompt 1/2 will need to test a real login form and MFA challenge form and will have to solve this tooling gap and the feature simultaneously unless addressed first. MAJOR.
4. **No production staff-provisioning/bootstrap mechanism exists.** `staff` INSERT is `super_admin`-only at the RLS layer (`packages/db/src/schema/identity.ts:163-168`), which is correct in isolation but creates a circular bootstrap problem for the *first* super_admin in a real environment. `supabase/seed.sql` provisions test staff accounts, but is explicitly local/test-only ("Never run against a remote/production project," `supabase/seed.sql:4`). This was already named as an open question in ADR-024 ("exact staff provisioning flow"); this review adds the concrete mechanism detail. MAJOR.
5. **No rate-limiting exists anywhere in this repository for staff password/MFA attempts**, because Supabase Auth's `signInWithPassword`/`mfa.verify` calls go directly from the browser to Supabase's own Auth API — they never pass through `apps/api`, so `apps/api`'s existing tiered rate limiting (`apps/api/src/config/rateLimit.ts`) is structurally irrelevant to protecting them. Brute-force protection for staff login depends entirely on Supabase's own platform-level defaults, which were not inspected (no live project available this session). MAJOR / UNVERIFIED.

None of these block *beginning* Prompt 1 — items 1 and 5 are naturally part of what Prompt 1 itself should design and deliver (backend AAL2 enforcement, and an explicit decision on whether Supabase's platform defaults are sufficient), and items 2–4 are addressable in parallel without architectural rework. **Verdict: ⚠ APPROVED AFTER MINOR IMPROVEMENTS** — see §22–23.

---

## 2. Overall Architecture Assessment

**VERIFIED** (direct inspection): `apps/reception-dashboard` follows a conventional layered SPA structure — `pages` (route content) → `layouts` (shell) → `features` (reserved, empty) → `components` (presentation) → `contexts`/`hooks` (state) → `services` (data access boundary) → `lib` (infrastructure). Dependency direction is consistently inward: `pages` import `layouts`/`components`, `components` import nothing from `pages`/`layouts`, `services` import only `lib` and never `contexts`/`components`. No circular import was found in a manual trace of every new file's import list.

Presentation does not own business rules — there are none yet to own. Every business `services/*` file (`StudentService`, `LeaveService`, `ParentApprovalService`, `NotificationService`, `AuditService`, `EmergencyService`, `HealthService`, `DashboardService`, `ReportService`) is a TypeScript interface with zero implementation (`apps/reception-dashboard/src/services/*/,*.ts`, verified by reading all nine files). `authService`/`mfaService`/`realtimeClient` are real but are infrastructure wrappers around Supabase SDK calls, not business logic.

**Finding — MINOR**: `src/routes/RequireRole.tsx` is defined, documented, and exported, but is **not imported anywhere** (`grep -rn "RequireRole" apps/reception-dashboard/src` → only the definition and two doc-comment mentions). It is inert code, not wired into `routes/index.tsx`. This is defensible for Prompt 0.2 (RBAC is Prompt 3's explicit scope) but should not be mistaken for "RBAC is half-wired" — it is currently unreachable.

## 3. Engineering Foundation Assessment

**VERIFIED**: TypeScript strict mode is on (`apps/reception-dashboard/tsconfig.json` — `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`); the whole workspace passes `pnpm run typecheck`/`lint`/`format`/`build` (re-run during this review — see §17 Validation Evidence). Dependency versions are consistent with `apps/parent-mobile`: `react`/`react-dom` `19.1.0` exact match in both `package.json`s; `@supabase/supabase-js` `^2.113.0` exact match; `@tanstack/react-query` `^5.102.8` exact match (verified by direct `grep` across both `package.json`s this session, not assumed).

**Finding — MAJOR**: No `jsdom`/`@testing-library/react` dependency exists anywhere in the workspace (`packages/api-client-react/package.json`, `apps/parent-mobile/package.json`, `apps/reception-dashboard/package.json` all checked). `vitest.config.ts`'s own comment already flags this as "a deliberately not-yet-made decision" for `apps/parent-mobile`, and the Reception Dashboard scaffold repeats the same deferral rather than resolving it. Only one test file exists in the entire new app (`apps/reception-dashboard/src/contexts/authStatus.test.ts`, 8 tests, pure-logic). **Recommendation**: establish the component-testing harness *before* Prompt 1 begins writing a real login/MFA form, not concurrently with it.

**Finding — MINOR**: No E2E test exists or is configured, despite Playwright being the already-selected web E2E tool (`docs/technology-decision-matrix.md`). Acceptable at this stage (no feature to test yet); flag as a Prompt-1-exit-criterion, not a Prompt-1-entry blocker.

Documentation is genuinely thorough and traceable: `apps/reception-dashboard/README.md`, `apps/reception-dashboard/docs/architecture.md`, `docs/reception-dashboard-architecture.md`, `docs/adr/ADR-023`, `docs/adr/ADR-024` all cross-reference correctly (link resolution re-verified this session).

## 4. Module Responsibility Matrix

| Responsibility | Owner (per ADR-001/SDD Ch.3/7) | Current implementation state | Verified boundary intact? |
|---|---|---|---|
| Student authentication | Student App | Not built (separate app) | Yes — not touched by this work |
| Student hostel-leaving request creation | Student App → `POST /leave-requests` | Backend exists, student-only (`docs/api-contract.md`) | Yes |
| Reception verification, movement, parent-approval initiation, operational audit visibility | Reception Dashboard | Interfaces only (`LeaveService`, `StudentService`, `AuditService`) | Yes — no implementation to violate the boundary yet |
| Parent authentication, trusted device, biometric, approval decision, approval history | Parent App | Fully implemented, unmodified by this work (`git status` shows zero changes under `apps/parent-mobile` this session) | Yes — `ParentApprovalService`'s own doc comment (`apps/reception-dashboard/src/services/parent-approval/ParentApprovalService.ts:9-13`) explicitly restates this boundary |
| Library Pass, QR verification, journey monitoring | Library Dashboard (not yet scaffolded) | N/A | Yes — Reception Dashboard's own role matrix (`docs/reception-dashboard-architecture.md` §7) explicitly excludes `library_incharge` |
| SAP Holiday Request / mentor approval | External (KIIT SAP) via a not-yet-built scraper | Not implemented; not modeled; not referenced by any Reception Dashboard code | Yes — confirmed by `grep -rn -i "sap"` across `apps/reception-dashboard/src` → no matches |
| Backend authorization / RLS | `apps/api` + Postgres | Unmodified by this work | Yes |

**No cross-boundary leakage found.** This is easy to verify precisely *because* nothing has been implemented yet — the real test of this boundary happens in Prompt 3+ (RBAC) and Phase 3 (Leave Approval Management), not now.

## 5. Parent Application Integration Assessment

**VERIFIED**: `apps/parent-mobile` has zero uncommitted changes attributable to this work (the pre-existing ADR-003 device-attestation diff from before this session's Reception Dashboard work is untouched — confirmed via `git status` showing identical `apps/parent-mobile/*` entries before and after). `ParentApprovalService`'s interface only exposes `getStatus(leaveRequestId)` — a read, not a write, and explicitly documents that session creation/notification/escalation/decision remain Parent-App-owned. No duplicated OTP, device-trust, or biometric logic exists in the Reception Dashboard.

## 6. Monorepo Compatibility Assessment

**VERIFIED**: `apps/reception-dashboard` follows the existing `apps/*` convention (`pnpm-workspace.yaml` glob, unchanged). It correctly does **not** extend the root `tsconfig.base.json` (NodeNext resolution, wrong for a Vite/browser app) — this exact deviation is independently justified and precedented by `apps/parent-mobile`'s own non-base tsconfig (`expo/tsconfig.base`), and is documented as a deliberate choice (`apps/reception-dashboard/tsconfig.json:1-6`). Root `eslint.config.js`, `vitest.config.ts`, and `.prettierrc.json` all apply to the new app without modification (only `vitest.config.ts`'s `include` array was extended — a data addition, not a rule change).

**Finding — MINOR**: `packages/api-client-react/package.json` declares `"@tanstack/react-query": "^5.90.0"` as its own dependency floor, while both consuming apps pin `^5.102.8`. Not a real conflict (5.102.8 satisfies ^5.90.0), but worth tightening the floor to match actual usage the next time that package is touched, to avoid the appearance of drift.

## 7. Shared Package Utilization Assessment

**VERIFIED**: `@digihostel/api-client-react` and `@digihostel/api-zod` are consumed as workspace dependencies (`apps/reception-dashboard/package.json`); the generated hooks/types are not duplicated anywhere in the new app (`grep -rn "z.object\|z.string" apps/reception-dashboard/src` → no matches — no hand-rolled Zod schema exists). The one shared-package change (`packages/api-client-react/src/custom-fetch.ts`'s `setApiBaseUrl()`) is minimal, additive, and independently tested (`custom-fetch.test.ts` gained 2 new passing cases, re-verified this session — see §17).

No new shared package (e.g. `packages/ui`) was created. **This is correct, not an omission**: there is exactly one web app so far; a shared design-system package would be premature abstraction until a second web app (Library Dashboard) actually exists to share it with — consistent with `.claude/rules/coding.md`'s "do not add speculative abstractions."

## 8. Supabase Architecture Assessment

**VERIFIED**: no second Supabase project, no dashboard-only database, no privileged browser credential (`grep -rn -i "service_role\|SERVICE_ROLE"` across `apps/reception-dashboard` → zero matches outside comments explicitly forbidding it). The Supabase client (`apps/reception-dashboard/src/lib/supabase/client.ts`) is session-management-only — no business table query exists anywhere in the app.

**Authentication vs. authorization**: correctly *not* conflated at the frontend. `AuthContext`'s `status` reaching `"authenticated"` means "Supabase says this session is `aal2`" — it says nothing about role or hostel scope, and the code's own comments say so explicitly (`apps/reception-dashboard/src/contexts/AuthContext.tsx:33-38`). The intended chain (Identity → Authentication → AAL2 → Staff Role → Permission → Hostel Scope → Backend Authorization → RLS) is **correctly represented in documentation** but **only the first three links are implemented anywhere** — role/permission/hostel-scope resolution has no client-side implementation yet (by design, correctly deferred) and, critically, **the backend does not yet implement the AAL2 link either** (§9 below).

**RLS** (unchanged by this work, re-verified by reading `packages/db/src/schema/*.ts` and `docs/rls-policy-matrix.md` fresh this session): fail-closed by default (`FORCE ROW LEVEL SECURITY`, per `docs/rls-policy-matrix.md:3`); reception/hostel_admin are hostel-scoped via `SECURITY DEFINER` helper functions, not raw claims; `library_incharge`'s global (non-hostel-scoped) access is a pre-existing, intentional, unrelated design choice, not something this work touched or should touch.

## 9. Security Architecture Assessment (adversarial)

This section is the substantive adversarial pass requested by §6/§12 of the review prompt.

### 9.1 Highest-risk attack paths, assessed

1. **Staff password compromise** — mitigated by mandatory MFA (ADR-024) *once implemented*; today, no login exists at all, so this path is currently closed by absence of the feature, not by a control. Not yet testable.
2. **MFA bypass at the frontend** — `RequireAuth` correctly treats `mfa_required` identically to `unauthenticated` (§2 finding notwithstanding, the *current* behavior is correct). A client that skips the React app entirely (e.g., calls Supabase Auth directly with curl) is unaffected by this frontend control either way — this is precisely why §9.2 (backend enforcement) matters.
3. **AAL1 session treated as authorized** — **this is the CRITICAL finding.** See §9.2.
4. **Role escalation** — no client-side role assignment exists to escalate (role resolution isn't implemented yet); server-side, `staff.role`/`staff.hostel_id` are only writable via `staff_all_super_admin`'s RLS policy (super_admin only) or Fastify's service-role connection — unaffected by this work.
5. **Cross-hostel data access** — unaffected by this work; existing RLS hostel-scoping (`is_hostel_admin_for_student`, `is_reception_for_student` helpers) is unchanged and was independently pgTAP-tested in prior work (F-05/F-05A, `docs/current-state.md`).
6. **Unauthorized leave-approval initiation** — no such endpoint exists yet (`docs/reception-dashboard-architecture.md` §9 item 5 flags this as an unresolved product/API question); nothing to exploit yet.
7. **Unauthorized student-movement updates** — no such endpoint exists yet (Digital Library Pass backend unbuilt).
8. **Realtime subscription abuse** — `useRealtimeChannel` (`apps/reception-dashboard/src/hooks/useRealtimeChannel.ts`) subscribes to no business table; Postgres Changes realtime is RLS-scoped at the database layer regardless of what a client requests, so even a maliciously modified client cannot receive rows RLS wouldn't otherwise allow. Low risk today; revisit once `journey_events`/`security_incidents` join the realtime publication.
9. **Client-side permission bypass** — explicitly, repeatedly documented as *expected and non-fatal* throughout the codebase (every guard's doc comment states the backend/RLS is the real boundary) — correct posture.
10. **API authorization bypass** — `apps/api`'s existing guards (`requireStaffRole`, `requireStaffScopeForStudentHostel`) are unmodified and were not touched by this work; they remain a real, working boundary for whatever routes exist today. They do **not** yet check AAL (§9.2).
11. **Supabase service-role key exposure** — none found (§8).
12. **Audit-log tampering** — unaffected; `audit_logs` has zero client-facing RLS (unchanged), and no Reception Dashboard code writes to it (nothing writes to it at all yet from this app).

### 9.2 CRITICAL — Backend has no AAL2 enforcement

- **Finding**: `apps/api`'s JWT verification (`apps/api/src/lib/auth/jwt.ts`) and every authorization guard (`apps/api/src/lib/auth/guards.ts`) check role, own-id, and hostel scope — never the token's authenticator assurance level or `amr` claim.
- **Evidence**: `grep -n "aal\|amr\|assurance" apps/api/src/lib/auth/jwt.ts apps/api/src/lib/auth/guards.ts apps/api/src/lib/auth/types.ts` → zero matches (run fresh this session).
- **Risk**: Once any staff-facing Fastify route exists (e.g. the staff-scoped leave listing planned for Phase 3), a staff member who has completed only the password step (`aal1`) — but who holds a valid, unexpired Supabase JWT, which Supabase issues *before* MFA is completed — could call that route successfully via a direct HTTP request, bypassing the frontend's `RequireAuth` entirely. The frontend gate is real UX, not a security boundary (correctly documented as such everywhere), so this is not "the frontend claims something false" — it's that **no boundary anywhere currently enforces AAL2**, frontend or backend.
- **Affected component**: `apps/api` (not yet built: any staff-facing business route). Not exploitable *today* only because no such route exists yet.
- **Recommended resolution**: `apps/api`'s JWT verification should read the token's `aal`/`amr` claims (Supabase includes these in the JWT) and a new guard (e.g. `requireAal2()`) should be composed into every staff-facing route's preHandler chain, mirroring the existing `requireActiveTrustedDevice` pattern already used for parents (`apps/api/src/lib/auth/guards.ts:192-208`).
- **Must be resolved before Prompt 1?** No — but it **must be explicitly scoped into Prompt 1 or an immediate fast-follow**, not silently deferred past the point where a real staff route ships. Recommend Prompt 1's own acceptance criteria include this.
- **ADR required?** No new ADR — this is an implementation detail of ADR-024's already-accepted decision, not a new architectural choice. ADR-024's Consequences section already names this exact question as open; this review confirms it should be resolved, not that a new decision needs making.

### 9.3 MAJOR — No rate-limiting for staff login/MFA attempts

- **Finding**: `apps/api`'s tiered rate limiting (`apps/api/src/config/rateLimit.ts`, `apps/api/src/plugins/rateLimit.ts`) protects only routes registered on `apps/api`. Staff password sign-in and MFA verification will call Supabase Auth's own REST API directly from the browser (this is how every other Supabase-Auth-based flow in this codebase works, including the parent OTP flow's *underlying* `signInWithOtp`/`verifyOtp` calls) — these requests never reach `apps/api` and are therefore entirely outside this repository's own rate-limiting.
- **Risk**: brute-force/credential-stuffing resistance for staff accounts depends entirely on Supabase's own platform-level Auth rate limits, which were **not inspected this session** (no live Supabase project available) — **UNVERIFIED**, not confirmed either sufficient or insufficient.
- **Recommendation**: before Prompt 2 ships a real login form, explicitly confirm Supabase's project-level Auth rate limits (Dashboard → Authentication → Rate Limits) are configured appropriately for this threat model, or document the decision to accept the platform default.
- **Must be resolved before Prompt 1?** No — Prompt 1 is infrastructure, not the shipped login form. Should be a Prompt 2 exit criterion.

### 9.4 MAJOR — No production staff-provisioning/bootstrap mechanism

- **Finding**: `staff` table INSERT is `super_admin`-only via RLS (`packages/db/src/schema/identity.ts:163-168`, `staff_all_super_admin` policy) — correct in isolation, but nothing in the repository provisions the *first* super_admin in a real (non-seeded) environment.
- **Evidence**: `supabase/seed.sql` creates test staff rows including a `super_admin` (`supabase/seed.sql` lines ~19, ~35) but is explicitly local/test-only (`supabase/seed.sql:1-4`, "Never run against a remote/production project"). No script, runbook, or documented procedure for production bootstrap was found (`grep -rln -i "seed\|bootstrap.*staff\|first.*super_admin" supabase/ apps/api/src` → only test/fixture files, confirmed this session).
- **Risk**: not a security vulnerability per se (the RLS default is correctly restrictive), but a genuine operational gap that will block the *first* real deployment if not planned for.
- **Must be resolved before Prompt 1?** No — local development is unblocked by `seed.sql`. Should be resolved before any staging/production deployment (Phase 5, User Management, or an explicit runbook).

### 9.5 MAJOR (hardening, not exploitable today) — `RequireAuth`'s deny-list structure

See Executive Summary item 2 and §2. Recommend converting to an explicit allow-list (`if (status !== "authenticated") return <Navigate .../>`) the next time this file is touched (natural to do as part of Prompt 1, since Prompt 1 will touch this file anyway to wire the real login route).

### 9.6 Session/token handling

**VERIFIED**: `apps/reception-dashboard/src/lib/supabase/client.ts` uses `persistSession: true`/`autoRefreshToken: true` with the SDK's default browser storage (localStorage) — standard, matches Supabase's own recommended browser configuration; no custom token storage was invented. No token is ever logged (`grep -rn "access_token\|refresh_token" apps/reception-dashboard/src` → only type-safe destructuring in `authService.ts`/`mfaService.ts`, never passed to `logger`).

**MINOR / REQUIRES CONFIRMATION**: localStorage-based session persistence is standard for Supabase SPA apps and is not itself a defect, but for an *administrative* dashboard it's worth an explicit, documented decision (not necessarily a change) about session lifetime/idle-timeout policy — no such policy exists yet anywhere in the codebase or docs. Not a blocker; a Prompt 1/2 design question.

## 10. Authentication Readiness Assessment

The state architecture (`AuthStatus`, `AuthContext`, `mfaService`) is real, tested for its pure-logic core (8/8 passing, re-run this session), and correctly distinguishes `mfa_required` from `authenticated`. It is **ready to be built against** by Prompt 1. It is **not** itself a working authentication system — no sign-in call exists anywhere (verified: `grep -rn "signInWithPassword" apps/reception-dashboard/src` → zero matches, correctly, since Prompt 0.2 was explicitly forbidden from building it).

## 11. RBAC Readiness Assessment

Type-level foundation exists (`types/roles.ts`, `RequireRole.tsx`) but **is not wired to any real data source and is not composed into any route** (§2 finding). This is appropriate for Prompt 0.2's scope (RBAC is Prompt 3) but means RBAC readiness is "foundation drafted, zero integration" — an honest MINOR/expected state, not a regression.

## 12. Realtime Architecture Assessment

`useRealtimeChannel` is a correct, leak-safe generic lifecycle wrapper (subscribes on mount, removes on unmount and on channel-name change, dependency array correctly scoped) — verified by re-reading the hook fresh this session. No business table subscription exists. Durable database state (not realtime) remains the documented source of truth throughout (`docs/reception-dashboard-architecture.md` §15, unchanged, still accurate). No conflict-resolution/reconciliation logic exists yet — appropriately, since nothing is subscribed to.

## 13. Workflow Consistency Assessment

No workflow code exists yet (leave, parent-approval, verification, exit/return, emergency, health are all interfaces or unbuilt). The **conceptual** distinction between Student request / SAP holiday approval / Reception verification / Parent approval / Final departure is preserved correctly in every document that discusses it (`docs/reception-dashboard-architecture.md`, `apps/reception-dashboard/docs/architecture.md`'s "Two leave-domain concepts" section) and is not contradicted anywhere in code (there is no code to contradict it). Race-condition analysis (parent-approves-while-reception-cancels, duplicate approval, etc.) is **not yet applicable** — there is no state machine implemented in this app to race against. This is correctly deferred to Phase 3, not a gap in the current foundation.

## 14. UI/UX Architecture Assessment

Design tokens are ported (not imported — different rendering engines) from `apps/parent-mobile/src/styles/tokens.ts` with identical values (verified: colors/spacing/radii/motion numerically identical between the two files, checked this session). Visual direction (modern/minimal/enterprise/desktop-first) is consistent with the stated goal. Accessible primitives exist: `Dialog` uses the native `<dialog>` element (built-in focus trap, Escape-to-close); `StatusBadge` pairs an icon glyph with text, never color alone; `ErrorState`/error messages use `role="alert"`; visible focus is enforced globally (`global.css:29-32`, never suppressed).

**Finding — MINOR**: `StatusBadge.module.css` uses CSS `color-mix()` (e.g. `color-mix(in srgb, var(--color-success) 15%, transparent)`), which requires a relatively modern browser (Chrome 111+/Safari 16.2+/Firefox 113+, 2023-era). If unsupported, the background tint simply doesn't render (icon+text remain legible) — a graceful, non-blocking degradation, but worth a conscious browser-support-baseline decision for staff devices before this compounds across more components.

## 15. Accessibility Assessment

Foundation is genuinely accessibility-conscious, not merely claimed: semantic `<table>` (not a div-grid) in `Table.tsx`; every form primitive (`SearchInput`, `FormField`) pairs a real `<label>`; `reduced-motion` media query respected globally; keyboard navigation relies on native elements (`<button>`, `<dialog>`, `<a>`/`NavLink`) rather than div-with-onClick patterns throughout (verified by reading every `components/ui/*` file this session — no non-semantic clickable div found). No accessibility regression risk identified for Prompt 1 to inherit.

## 16. Performance & Scalability Assessment

Route-level code-splitting is real and working (verified in the Prompt 0.2 build output: 18 separate ~0.3KB page chunks). No pagination/virtualization exists yet — appropriately, since no data table renders real data yet. The one build warning (main chunk ~519KB, unsplit vendor code) is cosmetic at this stage and explicitly *not* something to prematurely optimize per the project's own stated principle; revisit once real page weight grows.

## 17. Developer Experience Assessment

Re-ran the full validation suite fresh during this review (not merely trusting the prior session's self-report):

| Check | Result |
|---|---|
| `pnpm run typecheck` (8 packages) | **Pass** |
| `pnpm run lint` (repo-wide ESLint) | **Pass** |
| `pnpm exec prettier --check` (touched packages) | **Pass** |
| `pnpm exec vitest run` (full workspace) | **643 passed / 55 skipped / 0 failed** |
| `pnpm run build` (incl. `verify-workspace-package-resolution`) | **Pass** |

Environment setup is documented and reproducible (`apps/reception-dashboard/README.md`, `env.example`). No secret was found in any committed file.

## 18. Risks & Mitigation Strategies

See §9 for the full adversarial analysis; summarized:

| Risk | Severity | Mitigation | Timing |
|---|---|---|---|
| Backend has no AAL2 enforcement | CRITICAL | Add `aal`/`amr`-aware guard to `apps/api` | Scope into Prompt 1 or immediate fast-follow |
| No component-test harness | MAJOR | Add `jsdom`+Testing Library before writing login/MFA screens | Before Prompt 1 UI work |
| No staff bootstrap mechanism | MAJOR | Document/build a production provisioning procedure | Before first staging/production deploy |
| No rate-limit visibility for staff auth | MAJOR/UNVERIFIED | Confirm Supabase project Auth rate-limit settings | Before Prompt 2 ships |
| `RequireAuth` deny-list structure | MAJOR (hardening) | Convert to explicit allow-list | Natural to fix while touching this file in Prompt 1 |
| `RequireRole` unwired | MINOR | No action needed until Prompt 3 | Prompt 3 |
| No E2E/Playwright config | MINOR | Add when a real workflow exists to test | Prompt 1 exit criterion |
| CSS `color-mix()` browser floor | MINOR | Confirm staff device/browser baseline | Low priority |
| Session idle-timeout policy undecided | MINOR | Explicit product decision, not a defect | Prompt 1/2 |

## 19. Future Extensibility Assessment

The folder/service/layout structure imposes no obstacle to Library Dashboard (a future, separate web app that would reuse the same shared packages and could reasonably copy this app's own conventions) or to Student App integration (out of scope for this web dashboard entirely, per ADR-001). No premature abstraction was introduced that would need unwinding later (no shared `packages/ui` was speculatively created — correctly deferred until a second consumer exists).

## 20. Recommendations Before Authentication Development

1. Add `jsdom` + `@testing-library/react` to `apps/reception-dashboard` (or the workspace) before writing the login/MFA components.
2. Scope backend `aal2` enforcement (`apps/api`) into Prompt 1's own deliverables, or explicitly schedule it as an immediate fast-follow — do not let it drift silently past a real staff route shipping.
3. Convert `RequireAuth`'s status check to an explicit allow-list while Prompt 1 is already touching this file.
4. Confirm (or explicitly accept) Supabase's platform-level Auth rate-limit configuration for staff sign-in before Prompt 2 ships a real form.
5. Decide and document a staff-provisioning/bootstrap procedure before any non-local deployment — not required to start Prompt 1.

---

## 21. ADR Review

**ADR-024 remains correct and is not reopened.** No evidence contradicts its decision (Supabase Auth password + native TOTP MFA + AAL2). This review's findings *implement* what ADR-024 already flagged as open (server-side AAL2 enforcement, staff provisioning) rather than contradicting anything it decided.

**No new ADR is required.** Every finding in this review is an implementation/hardening detail of an already-accepted decision (ADR-024) or a tooling/process gap (test harness, rate-limit confirmation, bootstrap runbook) — none rises to the level of a genuine new architectural choice requiring its own ADR.

**Decision-log update**: not required by this review — `docs/decision-log.md`'s existing ADR-024 entry already correctly states the decision and its known-open consequences; this review adds evidence and severity, not a new decision.

## 22. Prompt 1 Gate

**MUST FIX BEFORE PROMPT 1**: none. No finding in this review blocks beginning Authentication Infrastructure work.

**SHOULD FIX BEFORE PROMPT 1** (or as an explicit, tracked part of Prompt 1 itself):
- Component-test harness (jsdom + Testing Library) — install before writing the first real form component.
- `RequireAuth` allow-list conversion — trivial, natural to bundle with Prompt 1's own edit to this file.
- Explicit acknowledgment/scheduling of backend AAL2 enforcement as Prompt 1 (or immediate fast-follow) work, not silent deferral.

**SAFE TO ADDRESS LATER**:
- Staff production-provisioning runbook (before first non-local deploy, not before Prompt 1).
- Supabase Auth rate-limit confirmation (before Prompt 2 ships, not before Prompt 1).
- E2E/Playwright setup (once a real workflow exists to test).
- `color-mix()` browser-support baseline decision.
- Session idle-timeout policy.
- `RequireRole` wiring (Prompt 3's scope).

## 23. Final Verdict

**⚠ APPROVED AFTER MINOR IMPROVEMENTS**

Conditions for full approval (all are "SHOULD FIX" items, none blocking): install the component-testing harness before UI work begins in Prompt 1; convert `RequireAuth` to an explicit allow-list; explicitly schedule backend AAL2 enforcement rather than letting §9.2's gap drift silently. None of these require architectural rework — the foundation itself is sound.

---

## 24. Scope Boundary Reminder

This review certifies the foundation only. It does not mean authentication, MFA UI, RBAC, leave workflows, parent approval, SAP scraping, or emergency/health modules are implemented. None of them are.

---

## Addendum — Resolution status (Prompt 3, RBAC & Authorization Framework)

Recorded after this review's original publication; the findings below are preserved as originally written above (historical record) — this addendum only tracks disposition, not a rewrite.

- **§9.2 CRITICAL — backend has no AAL2 enforcement**: **CLOSED.** `apps/api/src/lib/auth/guards.ts` gained `requireAal2()`, wired onto the one existing staff route (`POST /leave-requests/:id/expire`), verified with a real 403 test and empirically against a real local Supabase TOTP enroll+verify round-trip. See `apps/reception-dashboard/docs/authorization.md`'s "Backend authorization" section. Not resolved by this closure: whether every *future* staff route should carry this guard by convention — a design note for whoever adds the next one, not decided here.
- **§9.5 MAJOR — `RequireAuth`'s deny-list structure**: **CLOSED.** Converted to an explicit allow-list; regression-tested, including a simulated future/unrecognized status.
- **§3/§9 MAJOR — no component-test harness**: **CLOSED.** `jsdom` + `@testing-library/react` added; 50 reception-dashboard tests now include real component/route-guard renders.
- **§9.4 MAJOR — no staff bootstrap mechanism**: **still open**, unchanged, not addressed by this prompt (out of RBAC's scope — see `docs/reception-dashboard-architecture.md` §35).
- **§9.3 MAJOR — no confirmed staff-auth rate-limiting**: **still open**, unchanged.
- **§14 MINOR — `RequireRole` unwired**: **CLOSED** (now wired to a real `AuthorizationContext`, per §11 "RBAC Readiness" of this review recommending Prompt 3 do exactly this).

## 25. Final Certification Summary

**Architecture Status**: Sound, no structural rework required.
**Security Status**: Foundation-appropriate; one CRITICAL gap identified (backend AAL2 enforcement) that is pre-existing-by-design-deferral, not newly introduced, and must be closed before/immediately after real staff routes ship.
**Authentication Readiness**: Ready to build against (state architecture complete, tested, correct); no sign-in implementation exists yet (by design).
**RBAC Readiness**: Foundation drafted, zero integration (expected — Prompt 3's scope).
**Realtime Readiness**: Generic lifecycle correct and leak-safe; no business subscription exists (expected).
**Engineering Foundation**: Strong, with one real gap (no component-test harness).

**Blocking Findings**: 0
**Critical Findings**: 1 (backend AAL2 enforcement gap, §9.2)
**Major Findings**: 5 (no component-test harness §3/§9; no staff bootstrap mechanism §9.4; no confirmed staff-auth rate-limiting §9.3; `RequireAuth` deny-list structure §9.5; [react-query version-floor drift is MINOR, not counted here])
**Minor Findings**: 5 (`RequireRole` unwired; no E2E config; `color-mix()` browser floor; session idle-timeout policy undecided; react-query dependency-floor drift)
**Enhancements**: 0 explicitly raised beyond the above (none identified as purely optional beyond what's already listed as MINOR)

**Open Decisions** (confirmed correctly still open, not silently closed by this review):
- Whether `apps/api` independently enforces AAL2 server-side (ADR-024 Consequences; this review recommends resolving, doesn't resolve it).
- Exact staff-provisioning flow.
- MFA recovery/re-enrollment procedure.
- CORS origin configuration.
- Staff role/hostel provisioning details.
- Reception-initiated leave request creation (SDD Ch.7 §7.3 vs. current student-only API contract) — `docs/reception-dashboard-architecture.md` §9/§35, unrelated to authentication, still open.

**Unverified Dependencies**:
- Supabase project-level Auth rate-limit configuration (no live project inspected this session).
- Browser/device baseline for staff workstations (relevant to the `color-mix()` finding).

**Prompt 1 Recommendation**: **CONDITIONAL GO** — proceed, with the three SHOULD-FIX items in §22 tracked as part of or immediately alongside Prompt 1's own work.

**Final ASRB Verdict**: **⚠ APPROVED AFTER MINOR IMPROVEMENTS**

Justification: every finding in this review is either an already-known-open question (correctly not silently closed) newly evidenced with concrete detail, or a real-but-non-blocking hardening/tooling gap discovered through direct adversarial inspection rather than accepted from the prior sessions' own self-reporting. Nothing found requires architectural redesign, reopening ADR-024, or halting Phase 1. The three SHOULD-FIX conditions are small, well-scoped, and naturally sequenced into Prompt 1's own work rather than representing separate, delaying pre-work.
