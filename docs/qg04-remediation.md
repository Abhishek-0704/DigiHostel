# QG-04 Remediation Record

This document records the remediation of the findings from the independent
**QG-04 — Administration Platform Certification Review**, which returned a
verdict of **FAILED — REQUIRES ARCHITECTURAL REWORK**, driven by two
confirmed CRITICAL findings (F-QG04-01, F-QG04-02) plus one MAJOR testing
finding (F-QG04-03) and one MAJOR governance/provenance finding
(F-QG04-04).

This document does not rewrite or reinterpret the original QG-04 review —
that review's own findings, evidence, status matrix, and verdict remain the
authoritative historical record of what was found and why. This document
records only what was subsequently done about it, and the independent
recheck that followed.

---

## F-QG04-01 — Staff mutation concurrency / last-active-super-admin race (CRITICAL)

**Status: CLOSED**

### Original defect

`changeRole()`/`changeStatus()` (`apps/api/src/domain/staff/repository.ts`)
protected the "never leave zero active super_admins" invariant with a
plain, pre-transaction `COUNT(*)` (`countOtherActiveSuperAdmins()`), never
re-verified under a lock inside the transaction that performed the
mutation. Two concurrent requests, each demoting or suspending a different
one of the last two active super_admins, could both observe "1 other
active super_admin" simultaneously and both commit, leaving zero.

### Remediation

A single, deterministically-ordered `SELECT ... FOR UPDATE` — locking the
target row UNIONED with every currently-active super_admin row, ordered by
id — runs inside the same transaction as the mutation, immediately before
the invariant check. `countOtherActiveSuperAdmins()` was removed.

An earlier two-step version of this fix (lock the target row, then
separately lock the active set) was found, by this remediation's own
concurrency test, to deadlock under real Postgres: two transactions each
already holding their own target row's lock while trying to also acquire
the other's already-held row is a textbook lock-order-inversion deadlock,
and Postgres correctly detected and aborted one side (`40P01`). The single
unioned-query shape was adopted specifically because both concurrent
transactions resolve to the identical row set and request it in the
identical order, so no such cycle can form.

### Verification

A genuine `Promise.all` race (not sequential requests, not a mock) between
two real staff rows, each suspending the other, was run against real
Postgres (`apps/api/src/domain/staff/repository.integration.test.ts`).
Result: exactly one `"success"` and one `"last_super_admin_protected"`,
independently re-confirmed by a direct re-query of the database. The
normal, non-concurrent path was verified unaffected. An HTTP-level version
of the same race was attempted but is explicitly recorded as blocked, not
silently skipped: newly-invited staff accounts have no password until they
complete Supabase's own email-based invite flow, unavailable in this
environment.

---

## F-QG04-02 — Force Sign-Out non-functional (CRITICAL)

**Status: CLOSED**

### Original defect

`client.auth.admin.signOut(authUserId, "global")`
(`apps/api/src/lib/auth/staffIdentityAdmin.ts`) requires a session
access-token JWT as its first argument (confirmed against the installed
`@supabase/auth-js@2.113.0`'s own `.d.ts`/implementation — it POSTs that
value as a Bearer header to `/logout`), never a user id, and this backend
never stores a staff member's session JWT. Live-reproduced during the
original QG-04 review as a raw `AuthApiError: invalid JWT ... token
contains an invalid number of segments` (HTTP 500) on every invocation, for
every staff member, always.

The installed Admin API's complete method surface (`signOut`,
`inviteUserByEmail`, `generateLink`, `createUser`, `listUsers`,
`getUserById`, `updateUserById`, `deleteUser`) was exhaustively checked and
confirmed to have no user-id-keyed "revoke every session" capability at
all. `updateUserById`'s `ban_duration` was evaluated and rejected too: it
only blocks future sign-ins and has no effect on an already-issued,
unexpired JWT against this backend's own stateless JWT verification
(`apps/api/src/lib/auth/jwt.ts` — JWKS signature check only, never a
round-trip to GoTrue's live user state).

### Remediation

Force Sign-Out is now a genuine, fully backend-owned session-invalidation
mechanism: `staff.sessions_invalidated_before` (nullable `timestamptz`,
migration `0023_fqg0402_force_sign_out_session_invalidation.sql`). It is
set to `now()` inside the same transaction as its audit-log write
(moved from the fire-and-forget external-API convention to the
transactional-inline convention every DB-only mutation in this domain
already uses). `findStaffByAuthUserId`
(`apps/api/src/lib/auth/db-port.ts`) — the exact function every
authenticated request resolves through — now also receives the presented
JWT's own `iat` claim (threaded through `profile.ts` and `guards.ts`) and
rejects any token issued before the invalidation timestamp, exactly the
same per-request, fail-closed resolution point `status = 'active'` already
established for suspension.

`forceSignOut` was removed from `StaffIdentityAdminPort` entirely — it has
nothing left to do with the Supabase Admin API.

The `staff_self_update_column_guard` trigger (migrations `0009`/`0021`)
was extended a third time to deny-list this new column for non-super-admin
self-updates, closing the "staff member self-clears their own invalidation
timestamp to revive an already-revoked session" escape — the same class of
gap QG-01 and F-QG03-09 already taught this project to watch for.

### A design bug found and fixed during this remediation's own verification

A JWT's `iat` claim has whole-second precision while the invalidation
timestamp has microsecond precision. An initial attempt to fix a resulting
edge case — a genuinely new session established a few hundred milliseconds
after Force Sign-Out, in the same wall-clock second, being incorrectly
rejected — truncated the invalidation timestamp down to whole-second
resolution before comparing. Live end-to-end verification of that version
found it regressed to a genuinely **fail-open** condition: an old,
pre-invalidation token whose `iat` fell in the same (truncated) second as
the invalidation instant was then incorrectly *accepted*. This was
reverted. The final comparison is deliberately fail-closed across that
same one-second ambiguity window: a legitimate brand-new session
established in the exact same second as a Force Sign-Out may be rejected
once (self-resolving on the very next request), but a token that actually
predates the invalidation can never be accepted. This trade-off is
documented in `db-port.ts` and is intentional.

### Live verification

Performed against a real running `apps/api` process and real local
Supabase Auth (genuine password + TOTP-enrolled AAL2 sessions, no mocks).
9 of 9 checks passed:

- An existing valid session works before Force Sign-Out is invoked.
- Force Sign-Out now returns `202` (previously reproduced live as a raw
  `500` before this fix).
- The *same* previously-valid session is rejected `401` on its very next
  request.
- A genuinely new session, signed in after the invalidation, is accepted —
  Force Sign-Out invalidates existing sessions, it does not lock the
  account.
- An unauthorized role (`hostel_admin`) cannot invoke it (`403`).
- A super_admin cannot target themselves (`403`).
- A nonexistent target returns `404` with no false-success audit record.
- Server-side, persistent state: `sessions_invalidated_before` is a real
  Postgres column, independently re-queried by a separate connection —
  verified by architecture, not process memory.
- Hostel scope: not applicable — Force Sign-Out was never hostel-scoped
  (super_admin-only), unaffected by this change.

---

## F-QG04-03 — Real Supabase Admin API integration coverage (MAJOR)

**Status: PARTIALLY ADDRESSED**

| Capability | Real boundary exercised this remediation | Permanent automated real-boundary test | Classification |
|---|---|---|---|
| `forceSignOut` | Yes — no longer touches the Admin API at all (see F-QG04-02) | Yes — fully covered by real-Postgres integration tests | Closed by redesign |
| `inviteStaffUser` | Yes — live verification created two real `auth.users` rows via the real Admin API through a real running server | No — the existing integration test still stands in via a raw-SQL insert, not a real Admin API call | Partially verified |
| `resetPassword` / `sendPasswordResetEmail` | No — not re-exercised in this remediation (never found broken; re-testing it was out of this remediation's scope) | No | Unverified (unchanged from the original finding) |

Closing the residual gap for `inviteStaffUser`/`resetPassword` with a
permanent, CI-enforced test against the real Admin API remains open,
tracked but not implemented here, per the instruction not to opportunistically
expand this remediation's scope beyond the confirmed findings.

---

## F-QG04-04 — Git / provenance baseline (MAJOR)

**Status: CLOSED**

### Original defect

172 (independently re-confirmed as 175 at the start of this remediation)
uncommitted paths existed on `main`, including the entire Reception
Dashboard application and most backend domains built since Prompt 12 — no
commit history, PR, or review trail for the majority of the certified
platform.

### Remediation

All 175 paths were individually classified (legitimate source, tests,
migrations, documentation, generated artifacts, dev tooling) — zero
scratch, debug, temporary, or unrelated files were found. A secret-pattern
scan across every diff found nothing; `env.example` diffs contain only
placeholder values.

Three commits were created on `main` (no history rewrite, no force-push,
not pushed to `origin`):

1. `7e4d362` — `chore: consolidate pre-existing uncommitted platform work
   through Prompt 14` — the full pre-existing backlog, explicitly labeled
   as consolidating prior work rather than new authorship.
2. `2527df0` — `fix(staff): remediate QG-04 findings F-QG04-01/02/03` —
   this remediation's own 13 touched files.
3. `dad4848` — `style: fix prettier formatting` — one follow-up fix.

Several files touched by commit 2 (the entire `apps/api/src/domain/staff/`
directory, `staffIdentityAdmin.ts`) were themselves untracked, Prompt
13-era work that had never been separately committed — this remediation's
own edits could not be cleanly separated from that pre-existing content
without risky manual reconstruction. This is stated explicitly in that
commit's own body rather than presented as a misleadingly minimal diff.

Final state: 0 uncommitted paths.

---

## Regression Verification

Independently re-checked against the current repository and a fresh local
Postgres instance, not cited from any prior report:

- **QG-01** (`staff_self_update_column_guard`): present, now extended a
  third time (for `sessions_invalidated_before`); its pgTAP suite passes.
- **QG-02** (leave workflow state-gate): migration present and applied;
  its pgTAP suite passes.
- **QG-03** (`psr_select_hostel_admin`, `security_incidents_all_reception`,
  Library dormant-schema hardening): all present as the active policies;
  their pgTAP suites pass.
- **Prompt 13** (AAL2, `requireSuperAdmin()`, self-target protection,
  last-active-super-admin protection, request-time suspension
  enforcement): intact, and the last-active-super-admin protection is now
  genuinely concurrency-safe (a strengthening, not merely a preservation).
- **Prompt 14** (Configuration Center): untouched by this remediation.

## Full Verification (this remediation's own run, not historical figures)

- `pnpm run typecheck`: PASS, 8/8 workspace projects.
- `pnpm run lint`: PASS, 0 errors/warnings.
- `pnpm run format`: PASS for all tracked source (the one remaining warning
  is `supabase/.temp/linked-project.json`, an untracked, Supabase-CLI
  generated local artifact, not a repository defect).
- `pnpm run build`: PASS.
- `pnpm test`, `DATABASE_URL` unset: 1594 passed, 133 skipped, 0 failed
  (1727 total, 205 files).
- `pnpm test`, `DATABASE_URL` set (real Postgres): 1721 passed, 6 skipped,
  0 failed (1727 total, 205 files) — includes this remediation's 6 new
  tests, all passing against real Postgres.
- `supabase test db`: 368/368 pgTAP assertions, 28 files, on a clean
  `supabase db reset`. (A run performed immediately after the
  `DATABASE_URL`-enabled vitest suite, without an intervening reset, showed
  spurious failures from leftover integration-test fixture data
  contaminating fixed-count pgTAP assertions — reproduced, root-caused,
  and resolved by resetting; not a code regression, recorded here as an
  operational/test-ordering lesson: pgTAP and `DATABASE_URL`-enabled
  vitest runs must never share a database state without a reset between
  them.)
- Migration integrity: 24/24 applied, local = remote, zero drift.

## Final Certification

Both CRITICAL findings are genuinely fixed and independently re-verified —
F-QG04-01 under real Postgres concurrency (with a real deadlock found and
fixed during remediation), F-QG04-02 end-to-end against a real running
server and real Supabase Auth sessions (with a real fail-open regression
found during verification and corrected before being reported as fixed).
The governance finding is fully resolved. No regression was found in
QG-01, QG-02, QG-03, Prompt 13, or Prompt 14.

The one remaining item — permanent automated Admin API test coverage for
`inviteStaffUser`/`resetPassword` — is a MAJOR testing-depth gap, not a
known defect, and does not create a current material security risk.

**QG-04 CERTIFICATION: PASSED WITH MINOR IMPROVEMENTS**

**LIBRARY OPERATIONS DEVELOPMENT STATUS: SAFE TO PROCEED** — neither
CRITICAL finding touched the RBAC/RLS/audit/realtime foundation Library
Pass would build on; both were Staff Identity Administration defects, now
resolved. Extending the Audit Center for the Library domain (F-QG04-10 in
the original review) remains identified as day-one Library work, untouched
by this remediation.
