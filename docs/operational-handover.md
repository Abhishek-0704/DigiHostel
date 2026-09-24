# Reception Dashboard — Operational Handover

**As of**: v1.0.0, commit `39e91c881eeabfd178e384d1da058a824de2e408`.

This is a concise index for whoever operates this system day to day. It links to the authoritative documents rather than duplicating them — those documents are the source of truth; this page is the map.

## System Architecture

```
Vercel Production (frontend) → Render Production (digihostel-api-production) → Supabase Production (asphlfoikqyaeslmhrah)
```
Staging is fully separate: Render Staging (`digihostel-api-staging`) → Supabase Staging (`lhonrqjmlhlehpbxvrag`).
Full record: `docs/runbooks/production-deployment.md`.

## Deployment & Migration Workflow

Production releases go through `.github/workflows/deploy-production.yml` (`workflow_dispatch`, `main`-only, migration → Render deploy → health/provenance verification, one gated sequence). Staging deploys automatically on push to `main` via `ci.yml`'s `deploy-api` job. Exactly one migration authority exists for production (`deploy-migrations.yml`, reused by `deploy-production.yml`). Practical step-by-step: `docs/runbooks/release-checklist.md`.

## Authentication, RBAC, RLS

Password + native TOTP MFA, enforced to AAL2 for sensitive operations (ADR-024). RBAC + hostel-scoped Row-Level Security on every table. Full architecture: `apps/reception-dashboard/docs/authentication.md`, `apps/reception-dashboard/docs/authorization.md`, `docs/rls-policy-matrix.md`.

## Monitoring & Audit

`/system` (Monitoring Center, `super_admin`-only) and `/audit` (Audit Center, hostel-scoped) are the two operational visibility surfaces. Neither fabricates a signal it can't measure — an unmeasurable dependency reports `unknown`/`unavailable`. Full record: `apps/reception-dashboard/docs/monitoring-center.md`, `apps/reception-dashboard/docs/audit-center.md`.

## Realtime

Supabase Realtime, subscribed per-workflow (leave queue, approval events, movements, emergency/health queues and details, exit authorizations). No polling fallback is needed at current scale. Architecture: `docs/realtime-security-model.md`.

## Release Process

`docs/runbooks/release-checklist.md` is the operational checklist (pre-release, release, post-release smoke test, cleanup). `docs/releases/v1.0.0-release-notes.md` and `apps/reception-dashboard/CHANGELOG.md` record what shipped.

## Rollback

`docs/runbooks/production-deployment.md` §15. Application-level rollback only (Render's native previous-deploy mechanism, or `git revert` + redeploy). **No database rollback and no destructive-mistake recovery path exist** — see the next section.

## Known Limitations & Accepted Risks

The authoritative, current list is `docs/releases/v1.0.0-release-notes.md`'s "Known Limitations" table. The single most operationally important one: **production has no managed backup or PITR capability, by explicit governed decision (ADR-026), not by oversight.** A destructive database event — accidental deletion, a bad migration, a compromised credential misused — has no recovery path today. If you are the person who would decide whether to enable Supabase Pro + PITR, read ADR-026 in full before treating this as low-priority; it names your role directly.

## Incident First Response

1. **Determine scope**: application-level (bad deploy, code defect) vs. data-level (unwanted mutation/deletion).
2. **Application-level**: use the Rollback section above.
3. **Data-level**: **do not attempt an improvised fix.** There is no backup to fall back to if a hasty correction makes things worse. Stop, assess exactly what changed and why, and only act once you understand the blast radius — see `docs/runbooks/disaster-recovery.md` for the decision tree, honestly incomplete as it is for production (no PITR to restore from).
4. **Security incident** (suspected credential compromise, unauthorized access): use Force Sign-Out (Identity & Access Administration Center) on the affected account(s) immediately — this is the one control that can act faster than a password change. Then rotate the actual credential.

## Escalation Boundaries

- **Production infrastructure changes** (enabling PITR, provisioning new services, changing billing) require the account owner — no automated process in this repository performs these.
- **New production administrator accounts** are provisioned by the account owner directly (Supabase Dashboard + a `staff` row insert, per the certified architecture) — this is a standing, deliberate boundary, not a missing feature.
- **Architectural changes** (authentication, RBAC, RLS, deployment mechanism) require a new or superseding ADR, following `docs/adr/README.md`'s governance process — not an ad hoc code change.
