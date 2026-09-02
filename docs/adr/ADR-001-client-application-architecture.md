# ADR-001: Client Application Architecture

- **ADR ID:** ADR-001
- **Title:** Client Application Architecture
- **Status:** ACCEPTED
- **Date:** 2026-09-02
- **Related ADRs:** ADR-002 (Database Domain Model) — role separation here informs, but does not depend on, entity naming there.

## Decision

DigiHostel's mobile client layer will be implemented as **two separate mobile applications**:

1. **Student Mobile Application** — Student role only.
2. **Parent Mobile Application** — Parent and Guardian roles (Guardian is functionally an alternate/backup approver in the same escalation chain as Parent, and requires the same feature set: trusted-device registration, biometric-gated approval, approval history).

Reception Warden, Library In-charge, Hostel Administrator, and Super Administrator are **not** served by either mobile app. Per SDD Ch.3, they are served by separate web dashboards (Reception Dashboard, Library Dashboard, Administration surface), which is undisputed elsewhere in the SDD and is not altered by this ADR.

This resolves the SDD's internal contradiction in favor of the two-app model. No single "unified role-based mobile application" will be built.

## Context

Early in this session's SDD review (all 20 chapters read), an internal contradiction was found in how the SDD describes the mobile client layer.

### Conflicting SDD references

- **SDD Chapter 3 — Overall System Architecture** states, in its client topology description: *"One role-based mobile application serves Students, Parents, Guardians, Wardens and Library staff. Separate web dashboards for Reception and Administration."* This is a single sentence in a high-level architecture overview, with no further elaboration of how one binary would serve five roles with materially different feature sets and security postures.
- **SDD Chapter 9 — Student Mobile Application** is a full, dedicated chapter specifying a standalone application titled "Student Mobile Application" with its own module list: Auth, Home, Library Pass, Leave Status, Notifications, Profile, Offline Sync.
- **SDD Chapter 10 — Parent Mobile Application** is a full, dedicated chapter specifying a standalone application titled "Parent Mobile Application" with its own module list: Auth/Trusted Device, Home, Pending Approvals, Approval History, Device Management, Notifications, Profile, Offline Sync.

Chapters 9 and 10 are written, titled, and structured as two independent products. Chapter 3's single-app framing is not repeated or elaborated anywhere else in the SDD; no chapter describes how role-switching, shared navigation, or conditional feature visibility would work inside one binary. The two dedicated chapters represent deeper, more specific, and more recent-reading design work than the one-line aside in Chapter 3.

Note also: Chapter 3 itself already establishes that this system uses **multiple client surfaces by role category** (mobile for Student/Parent-side roles, separate web dashboards for Reception/Library/Admin roles). This ADR's decision extends that same principle — one client surface per coherent actor category — to the mobile layer, rather than introducing a new architectural pattern.

## Options Considered

### Option A — Single unified role-based mobile application
One Expo/React Native codebase, one binary, role-based navigation and conditional UI based on the authenticated user's role.

- **Pros:** one release pipeline, one app-store listing, maximal code sharing without relying on the monorepo's shared `lib/` packages.
- **Cons:** conflates two very different security postures (parent-approval-authority device trust vs. student-identity checkpoint verification) in one binary, increasing the blast radius of a compromised device or reverse-engineered client; forces unrelated release cadences together (a Parent-only bug fix requires a Student-facing app-store release); requires nontrivial conditional-rendering/navigation complexity to hide Parent-only screens (Device Management, Pending Approvals) from Students and vice versa (Library Pass, Leave Status) — Ch.9/Ch.10's module lists have almost no overlap; does not match either dedicated chapter's actual specification.

### Option B — Two separate mobile applications (Student, Parent+Guardian)
Two Expo/React Native codebases (as already scaffolded, before deletion, under the monorepo's `artifacts/*` convention), sharing common logic through the workspace's `lib/*` packages (API client, Zod schemas, etc.).

- **Pros:** matches SDD Ch.9 and Ch.10 directly; crisp security boundary between the parent-authority device-trust flow (Ch.4, Ch.17.2 anti-impersonation controls) and the student-identity checkpoint flow (Ch.6 QR/biometric); independent release cycles; smaller, more focused codebases; consistent with the SDD's own precedent of separate client surfaces per actor category (Reception vs. Library vs. Admin dashboards); code duplication is mitigated by the monorepo's shared-package structure, which is already the intended pattern for this workspace.
- **Cons:** two build/release pipelines and two app-store submissions instead of one; some duplicated UI infrastructure (though shared through `lib/*`).

### Option C — Defer the decision, implement Student app first, decide later
Reject making an explicit decision now; build whichever app is needed for the first feature and let structure emerge.

- **Pros:** avoids committing early.
- **Cons:** directly contradicts this project's constitution (`CLAUDE.md`, `workflow.md`) requiring specification-driven, non-speculative implementation; risks exactly the kind of silent architectural drift ADRs exist to prevent; a later "just add a screen for the other role" temptation would reproduce Option A by accident without ever deciding to.

## Rationale

1. **Specification weight:** Ch.9 and Ch.10 are dedicated, fully fleshed-out chapters; Ch.3's line is a brief, unelaborated aside in a high-level overview. When a detailed specification and a high-level summary conflict, the detailed specification is the stronger signal of actual intended design.
2. **Security:** The SDD's own threat model (Ch.17.4, STRIDE mapping) names spoofing/impersonation as a primary threat, countered specifically by trusted-device binding on the parent side. Keeping the parent-authority device-trust boundary in its own application makes that boundary structurally unambiguous — there is no code path where "the app that also does student checkpoint scans" could be confused with "the app that holds approval authority." This directly serves Secure by Default and Defense in Depth (`docs/security.md`).
3. **Role separation is clean:** Student and Parent/Guardian feature sets have almost no functional overlap (per the Ch.9/Ch.10 module lists), unlike, say, Student and Guardian, which share nothing either. There is no natural shared "home screen" concept between them.
4. **Consistency with existing SDD precedent:** the SDD already splits Reception/Library/Admin into separate web surfaces. Two mobile apps is the same pattern applied consistently, not a new one.
5. **Monorepo already supports this:** the workspace convention (`artifacts/*`, `lib/*`) that existed before the reset was already structured for multiple independently-buildable apps sharing common packages — this decision requires no new tooling pattern.

## Consequences

- Two Expo/React Native application packages will exist under `artifacts/` once mobile implementation begins (e.g., a student-facing app and a parent-facing app), each with its own `app.json`, build pipeline, and app-store presence.
- Shared logic (API client hooks, Zod schemas, design tokens/components) belongs in `lib/*` packages, consumed by both apps — this must be planned for during implementation, not bolted on later.
- Guardian role is served by the Parent app; no separate Guardian app or Guardian-specific mode is needed unless a future requirement demands materially different Guardian-only functionality (not currently specified).
- Reception/Library/Admin dashboards remain a separate, non-mobile concern, unaffected by this ADR.
- Any future implementation task that proposes a single combined mobile app, or a third/fourth mobile app for a role not listed here, contradicts this ADR and requires a superseding ADR before proceeding (see `docs/adr/README.md`).

## Rejected Alternatives

- **Option A (single unified app)** — rejected: weaker specification support, weaker security posture, and no elaboration anywhere in the SDD of how it would actually work in practice.
- **Option C (defer)** — rejected: contradicts this project's specification-first governance model and invites silent architectural drift.

## Impact on Future Implementation

- Client-side implementation planning must scope work as two applications from the start, not one app with a "we'll add roles later" plan.
- API/backend design (a separate future concern) should assume two distinct mobile client consumers with different auth/session needs (student identity sessions vs. parent device-trust sessions), which may inform — but does not itself decide — API surface design.
- This decision does not modify the SDD. Chapter 3's single-app sentence remains in the SDD text as written; this ADR is the authoritative implementation-level resolution of the conflict between Chapter 3 and Chapters 9–10, per `docs/implementation-baseline.md`'s source-of-truth hierarchy.
