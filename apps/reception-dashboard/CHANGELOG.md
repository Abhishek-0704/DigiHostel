# Changelog — Reception Dashboard

All notable changes to the Reception Dashboard application are recorded here. This is the first version this project has formally tagged — earlier work is summarized under `[1.0.0]` rather than reconstructed into synthetic prior versions, since no prior release was ever cut.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/); dates are the repository's own working dates, not calendar-verified release dates.

## [1.0.0] — 2026-09-24

First production release. Built from `main` at commit `39e91c881eeabfd178e384d1da058a824de2e408`, following the QG-06 Enterprise Go-Live & Deployment Readiness Certification (**GO-LIVE APPROVED WITH MINOR ACTION ITEMS**) and Prompt 19's Testing, QA & Release Hardening pass.

### Added

- Password + native TOTP MFA authentication with AAL2 enforcement (ADR-024).
- Role-based access control and hostel-scoped authorization (RBAC + RLS), covering `reception_warden`, `hostel_admin`, `library_incharge`, and `super_admin`.
- Dashboard shell, navigation, and operational home screen.
- Enterprise Notification Center.
- Reception Leave Request Queue and Parent Approval Session workspace, including reception-initiated parent-approval triggering.
- Student Operations Center (search/profile) and Movement Engine (Hostel Return).
- Student Verification & Exit Authorization workflow.
- Emergency Operations Center and Health Operations Center.
- Enterprise Audit Center.
- Identity & Access Administration Center (staff directory, provisioning, suspend/reactivate, force sign-out).
- Enterprise Configuration Center.
- Operational Intelligence & Executive Analytics Dashboard.
- Enterprise Reporting Platform.
- Administrative Profile & Personal Preferences Center.
- Enterprise Operations Monitoring Center (`super_admin`-only platform/application/security health, diagnostics).
- Realtime updates across leave, movement, emergency, health, and exit-authorization workflows via Supabase Realtime.
- A repeatable, GitHub Actions-controlled production deployment workflow (`deploy-production.yml`) covering migration application, Render API deployment, and health/provenance verification.

### Security

- QG-01 through QG-05 database-security remediations (see `docs/qg0*-remediation.md` for the full history) — hostel-scope isolation fixes across `staff`, `parents`, `parent_student_relationships`, `security_incidents`, `leave_approval_events`, and related tables.
- QG-04 Force Sign-Out redesign (`sessions_invalidated_before` + JWT `iat` enforcement) after the original Admin-API-based design was found non-functional.
- Baseline defense-in-depth HTTP security headers on every API response.

### Known Limitations

See the v1.0.0 release notes (`docs/releases/v1.0.0-release-notes.md`) for the full, current list. In brief: production PITR/managed backups remain deferred (ADR-026, SDD Ch.12 §12.7.1/Ch.16 §16.7.1/Ch.20 §20.4 — governed, not a defect); a Vite build-size advisory on the shared vendor chunk; a full screen-reader/reduced-motion accessibility pass remains outstanding; the Supabase-side GitHub Integration's status on the production project is unverified (F-QG06-13); mobile-app dependency vulnerabilities exist entirely within `apps/parent-mobile`/`apps/student-mobile`, confirmed with zero exposure to this application.
