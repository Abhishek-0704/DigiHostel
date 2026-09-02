# ADR-010: Notification Architecture

- **ADR ID:** ADR-010
- **Title:** Notification Architecture
- **Status:** ACCEPTED
- **Date:** 2026-09-02
- **Related ADRs:** ADR-004 (Mobile Technology — Expo Push), ADR-011 (Background Job Architecture — escalation timing depends on this).

## Decision

**Expo Push Notifications** (FCM/APNs via Expo's push service) for mobile delivery. The backend owns notification **orchestration**: constructing the escalation sequence (Father → Mother → Guardian → In-app call → Manual, SDD Ch.5 §5.2–§5.3), scheduling each step's timeout via the background job system (ADR-011), tracking delivery status per notification in the `notifications` table (ADR-002), and retrying failed deliveries with backoff. Fallback when push delivery fails or a step's timeout expires is the next step in the SDD's own escalation chain — not a separate notification-specific fallback channel (SMS/email are not MVP scope per the SDD).

## Context

Both mobile apps have a Notifications module (Ch.9, Ch.10). The SDD names a security KPI of 99% notification integrity (Ch.17.4) and a concrete, timing-sensitive escalation chain (Ch.5) — notification delivery isn't just "send a push," it's a safety-relevant sequencing system.

## Options Considered

- **Expo Push + backend-owned orchestration (selected)** — no added vendor beyond the already-chosen Expo stack (ADR-004); orchestration logic (who gets notified when, and what happens if they don't respond) lives in the backend where it can be tested, audited, and tied to `audit_logs`/`notifications` records, not left to a third-party notification platform's own logic.
- **Direct FCM/APNs integration (bypassing Expo Push)** — more control over payload/delivery receipts, but Expo Push already provides sufficient control for this use case and avoids maintaining two separate native push credential setups.
- **Third-party notification platform (e.g. OneSignal) owning orchestration** — rejected: the escalation chain's logic (timeouts, ordering, fallback to manual verification) is domain-specific business logic that must be auditable and testable in-house, not delegated to a third-party platform's rules engine.

## Consequences

- The `notifications` table (ADR-002) must record delivery status per attempt to support the 99%-integrity KPI and audit requirements.
- Escalation timing logic lives in the backend's background-job layer (ADR-011), not in client code or a third-party scheduler.
- SMS/email fallback is explicitly out of scope for this decision (matches the SDD's MVP scope) — a future requirement to add them is a scope change, not automatically a contradiction of this ADR, but should be recorded as an amendment or new ADR if it materially changes the orchestration design.

## Rejected Alternatives

Direct FCM/APNs, third-party orchestration platform — as above.
