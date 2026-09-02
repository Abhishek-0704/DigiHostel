# ADR-004: Mobile Technology

- **ADR ID:** ADR-004
- **Title:** Mobile Technology
- **Status:** ACCEPTED
- **Date:** 2026-09-02
- **Related ADRs:** ADR-001 (Client Application Architecture — mandates two apps, which this decision must serve efficiently), ADR-005 (Backend Architecture — language-sharing rationale depends on both).

## Decision

Both mobile applications (Student, Parent+Guardian per ADR-001) will be built with **React Native via Expo, in TypeScript**.

## Context

ADR-001 committed to two separate mobile applications. That decision increases the cost of any mobile-framework choice that doesn't share code/language with the rest of the stack, since two full apps must now be built and maintained instead of one. Candidates evaluated: Flutter, React Native/Expo, native Android+iOS (separately, per app — i.e. up to four codebases).

Full requirement evaluation is in `docs/architecture-requirements.md` (Client section) and `docs/technology-decision-matrix.md`.

## Options Considered

- **Flutter** — strong cross-platform parity and performance, mature biometric/QR/attestation plugin ecosystem. Rejected primarily because Dart cannot share types or Zod validators with a TypeScript backend without a codegen bridge, which adds friction that ADR-001's two-app requirement makes worse, not better.
- **Native Android + native iOS (per app)** — best possible platform integration and performance. Rejected: doubles to up to four codebases (2 roles × 2 platforms), not justified for an MVP/pilot-hostel-scale team.
- **React Native / Expo (TypeScript)** — selected. Mature `expo-local-authentication` (biometric), camera/QR scanning, push (Expo Push), geolocation, and community/first-party platform-attestation modules; Expo's managed workflow (EAS build/update) reduces the operational cost of running two apps; TypeScript unifies the language across both mobile apps and the backend (ADR-005), enabling direct sharing of Zod schemas and generated API types (ADR-007) instead of maintaining validation logic twice.

## Consequences

- Both apps live under the workspace's apps/packages structure (see `docs/workspace-structure.md`), sharing common packages (API client hooks, Zod schemas, design tokens) rather than duplicating logic.
- The team needs TypeScript/React Native proficiency, not Dart/Flutter or native Swift/Kotlin — this is now a hiring/skill constraint.
- EAS (Expo Application Services) becomes the mobile build/OTA-update mechanism (see ADR-013, deployment).
- Any future proposal to introduce Flutter or native modules for one app but not the other contradicts this ADR and requires a superseding ADR.

## Rejected Alternatives

Flutter and native-per-platform, as above — both lose the cross-stack TypeScript sharing that directly serves the two-app requirement ADR-001 created.
