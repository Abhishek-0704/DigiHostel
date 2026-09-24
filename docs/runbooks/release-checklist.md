# Reception Dashboard — Release Checklist & Post-Deployment Smoke Test

Companion to `docs/runbooks/production-deployment.md` (the authoritative deployment architecture/mechanism record) and `docs/releases/v1.0.0-release-notes.md` (what this specific release contains). This document is the practical, step-by-step checklist an operator actually runs.

## Before Release

- [ ] `git status` clean on the release branch (no uncommitted changes).
- [ ] Correct commit identified and recorded (see the release's own release-notes header).
- [ ] `pnpm run typecheck` — passes, all workspace packages.
- [ ] `pnpm run lint` — passes.
- [ ] `pnpm run format` — passes (`prettier --check .`).
- [ ] `pnpm run build` — passes (frontend + backend + workspace-resolution check).
- [ ] `pnpm exec vitest run`, with `DATABASE_URL`/`SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` set against a local Supabase instance — passes (full count, no skips).
- [ ] `supabase db reset` + `supabase test db` — passes, fresh reset (a stale local stack can produce false failures — always reset first).
- [ ] Production migration state matches local (`supabase migration list`-equivalent via the Management API) — no drift.
- [ ] Production configuration verified: production frontend → production API → production Supabase, staging fully separate (see `production-deployment.md` §9/§13 for the exact evidence this check reproduces).
- [ ] No secret value appears in the production frontend bundle (service-role key, JWT secret, connection string) — verified by fetching the live bundle and grepping it directly, not inferred.
- [ ] Vercel Production holds only the three required `VITE_*` variables (F-QG06-10 — verify no secret-tier variable has crept back in).

## Release

- [ ] Merge the approved release commit to `main` through the required PR + `Verify` CI check — never push directly.
- [ ] Dispatch `deploy-production.yml` (`gh workflow run deploy-production.yml --ref main`) — this runs migrations, deploys the Render API, and verifies health/provenance as one gated sequence. Do not dispatch from any ref other than `main` (the workflow itself and the `production` GitHub Environment's branch policy both reject this).
- [ ] Confirm the workflow's `verify` job passed — this already confirms `/healthz.version` matches the deployed commit; do not treat a merely-`success` `deploy-api` job as sufficient on its own.
- [ ] Vercel's own GitHub integration deploys the frontend automatically on the same `main` push — confirm the live canonical URL (`digihostel-reception-dashboard.vercel.app`) is serving the new build (check the bundle hash changed, or the footer's `v1.0.0` string once deployed).

## Immediately After Release

1. [ ] `GET /api/v1/healthz` → `200`, `version` matches the release commit.
2. [ ] `GET /api/v1/readyz` → `200`.
3. [ ] Staff login (password) succeeds for a real production staff account.
4. [ ] TOTP MFA challenge/verify succeeds.
5. [ ] AAL2 session established — confirm an AAL2-only route (e.g. `/staff`) now returns real data, not `403`.
6. [ ] Authorized Reception Dashboard shell loads (navigation, header, role badge).
7. [ ] Leave Request Queue loads.
8. [ ] A Parent Approval Session workspace opens for an existing leave request and shows the correct timeline.
9. [ ] Student Verification page opens for an approved leave and shows the correct checklist state.
10. [ ] Exit Authorization action remains available/reachable for an eligible leave (do not actually authorize a real exit merely to test this, unless a genuine, real exit is occurring).
11. [ ] Realtime connection establishes (Live Status indicator / a real-time update observed on an existing subscribed view).
12. [ ] Notification Center loads without error.
13. [ ] Monitoring Center (`/system`) loads for an authenticated `super_admin` and reports genuine, non-fabricated signals.
14. [ ] Audit Center (`/audit`) loads for an authorized staff member and returns real rows.
15. [ ] Logout works, and the resulting session is genuinely unauthenticated (a subsequent protected request returns `401`).

Do not include or invent checks for Emergency/Health/Analytics/Reporting/Configuration/Identity Administration beyond what's listed above unless a specific release note calls for it — the list above intentionally matches this prompt's own required smoke-test scope, not the full application surface (which Prompt 19's report already covers).

## Post-Release Cleanup (tracked, not automatic)

- [x] Delete the disposable `reception_warden` test staff account created during Force Sign-Out verification. **Done 2026-09-24, on explicit account-owner instruction.** The actual constraint was verified before deletion, not assumed: `staff.auth_user_id → auth.users(id)` is `ON DELETE NO ACTION`, not cascade — the `staff` row (`Force Signout Test`, id `a0ed4a09-5fc4-4ed6-ba4e-9246cf7b225e`) was deleted explicitly first (after confirming zero referencing rows in every other FK-dependent table), then the corresponding `auth.users` row (`9ffb66f2-7e37-45cc-8859-35cb79151448`) was deleted via the Supabase Auth Admin API. The dependent `staff_preferences` row (which genuinely does have `ON DELETE CASCADE`) was removed automatically. Verified post-deletion: `staff` contains exactly the real `super_admin` account, unaffected; the deleted auth user id returns `404 user_not_found`; production `/healthz`/`/readyz` unaffected.

## Rollback Quick Reference

See `docs/runbooks/production-deployment.md` §15 for the full rollback runbook (application rollback via Render's native previous-deploy mechanism, git-level rollback, and the explicit, unchanged forward-fix-only database policy). **Production has no managed backup/PITR capability** (ADR-026) — a destructive database event has no recovery path; this checklist does not claim otherwise.
