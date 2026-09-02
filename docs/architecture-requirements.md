# Architecture Requirements

Derived from the SDD (`sdd/`) and accepted ADRs (`docs/adr/`). Every requirement below cites its source. This document does not select technologies — see `docs/technology-decision-matrix.md` and `docs/target-architecture.md` for that.

## Client

### Student application
- Standalone application (per ADR-001, resolving SDD Ch.3 vs Ch.9): Auth, Home, Library Pass, Leave Status, Notifications, Profile, Offline Sync modules. — SDD Ch.9
- Roll-number based identity, tied to the student's own leave requests and library pass. — SDD Ch.2, Ch.9

### Parent + Guardian application
- Standalone application (per ADR-001): Auth/Trusted Device, Home, Pending Approvals, Approval History, Device Management, Notifications, Profile, Offline Sync modules. — SDD Ch.10
- Serves both Parent and Guardian roles (Guardian is a backup approver in the same escalation chain). — SDD Ch.2 §2.2, Ch.5; ADR-001

### Authentication
- Roll-number lookup → parent record validation → OTP → Supabase Auth session established (ADR-014) → device trust registration → biometric enrollment. — SDD Ch.4 §4.2; ADR-014
- Platform attestation (Play Integrity / DeviceCheck-App Attest) inserted between OTP and device registration. SIM verification is an open feasibility question, not yet mandated. — SDD Ch.17.2; ADR-003

### Trusted-device requirements
- One parent may register multiple trusted devices; device removal revokes sessions and forces fresh OTP+biometric on re-registration. — SDD Ch.4 §4.3–§4.4
- New-device flow includes a **future** (not MVP) optional approval-from-existing-device feature. — SDD Ch.4

### Biometric requirements
- Required before every parent approve/reject decision (not just OTP/tap). — SDD Ch.5 §5.2, Ch.10 §10.3
- Required at every library checkpoint (hostel exit, library entry, library exit, hostel return). — SDD Ch.2 FR-011, Ch.6 §6.2, Ch.9 §9.3

### Offline requirements
- Both apps require an "Offline Sync" client module with local encrypted storage and an offline event queue. — SDD Ch.9 §9.2, Ch.10 §10.2
- Conflict-resolution mechanism is **not specified** by the SDD at any level of detail (confirmed gap, not a contradiction) — left to architecture decision. — noted during this session's SDD conflict sweep

### Push notifications
- Both apps have a Notifications module. — SDD Ch.9, Ch.10
- Delivery must support the escalation chain's timing (Father → Mother → Guardian → In-app call → Manual). — SDD Ch.2 FR-007, Ch.5 §5.2–§5.3

### Realtime requirements
- Approval status, library journey status, and notifications must update in realtime, without client polling, via Supabase Realtime specifically (named, not generic). — SDD Ch.3, Ch.7, Ch.8, Ch.11 §11.9, Ch.13 §13.6

### QR scanning
- Client must display/scan dynamic QR at each library checkpoint; QR TTL is 30–60 seconds, one-time use, server-generated. — SDD Ch.6 §6.3, §6.7; Ch.17.3

### Geolocation
- Used only during active security incidents (missed checkpoint → status prompt → no response → temporary geolocation → notify authorities), and must stop automatically once the incident resolves. — SDD Ch.2 FR-012, Ch.6, Ch.9 (privacy-by-design constraint)

### Role separation
- Student app: Student role only. Parent app: Parent + Guardian. Reception Warden, Library In-charge, Hostel Administrator, Super Administrator are **not** mobile-client roles — served by separate web dashboards. — ADR-001; SDD Ch.3, Ch.7, Ch.8

## Backend

### API requirements
- REST, JSON, versioned (`/api/v1`), OpenAPI as source contract. — SDD Ch.13; `docs/api-contract.md`; `.claude/rules/api.md`
- Endpoint families: auth, leave, library, notifications, profile, audit. — SDD Ch.13 §13.4; one confirmed non-blocking inconsistency on library-checkpoint endpoint shape (generic `/library/scan` vs split verify-entry/verify-exit) — see `docs/adr/README.md` conflict log from the prior reset task.

### Authentication
- Identity/session issuance is owned by Supabase Auth (ADR-014, superseding ADR-006's auth clause). The OTP-gated roll-number verification, device-trust, and platform-attestation flow (bespoke — no off-the-shelf provider covers this exactly) remains fully required, implemented as Fastify/Postgres business-authorization gates on top of a valid Supabase session. — SDD Ch.4, Ch.17.2; ADR-003, ADR-014

### Authorization/RBAC
- 7 roles: Student, Parent, Guardian, Reception Warden, Library In-charge, Hostel Administrator, Super Administrator. — SDD Ch.2 §2.2
- Explicit RBAC matrix for Reception Warden / Hostel Admin / Super Admin exists (Ch.7 §7.5) but approval *decision* authority belongs to the parent only (biometric-gated), not the Warden. — SDD Ch.5, Ch.7, Ch.10

### Session management
- Session/token lifecycle is owned by Supabase Auth (access token, rotating refresh token, revocation) — ADR-014. Distinct from device-trust registration, which remains a Postgres-authoritative, Fastify-enforced concern (ADR-002, ADR-003). Full lifecycle detail: `docs/auth-database-security-model.md`.

### Approval workflows
- State machine: `Pending → Father Notified → Mother Notified → Guardian Notified → {Approved / Rejected / In-App Call / Manual Verification / Expired}`. — SDD Ch.5 §5.2–§5.3, Ch.2 FR-007

### Audit logging
- All modules write to an audit trail; audit logging is a first-class, non-optional requirement. — SDD Ch.3, Ch.11, Ch.12, Ch.17; `docs/database.md` ("All modules → Audit Logs")

### Realtime
- Backend must broadcast realtime events for approvals, journey events, notifications, and dashboard changes via Supabase Realtime. — SDD Ch.11 §11.9, Ch.13 §13.6

### Background processing
- Escalation timers (each step in the Father→Mother→Guardian→In-app call→Manual chain has an implied timeout before advancing). — SDD Ch.5 state machine
- Notification delivery/retry. — SDD Ch.2 FR-007, security KPI: 99% notification integrity (Ch.17.4)

### Notification orchestration
- Must implement the escalation chain's timing/order faithfully and track delivery. — SDD Ch.5, Ch.17.4

### SAP integration
- MVP: web scraping only (not an official API) — consistently stated across Ch.1, Ch.2 §2.5/FR-005, Ch.3, Ch.5, Ch.11. Official SAP API is future scope only. — SDD Ch.13 §13.7, Ch.18

### Security requirements
- TLS → JWT validation → RBAC → business logic → audit → response request path. — SDD Ch.17.1; `docs/security.md`
- Zero Trust, Least Privilege, Defense in Depth, Secure by Default, Privacy by Design, Fail Securely, Continuous Monitoring. — SDD Ch.17.1

## Database

### Relational requirements
- Canonical entities per ADR-002: `students, parents, trusted_devices, leave_requests, approvals, library_passes, journey_events, qr_sessions, notifications, audit_logs, security_incidents`, plus two open structural questions (session/token modeling, approval event/history granularity). — ADR-002; SDD Ch.12

### Transactions
- Multi-step authoritative state changes (approvals, QR checkpoint transitions) require transactional integrity. — SDD Ch.12; `.claude/rules/database.md`

### RLS/security requirements
- RLS must be evaluated for every protected table; never disabled as a shortcut. — SDD Ch.12, Ch.17.3; `.claude/rules/database.md`, `.claude/rules/security.md`

### Audit/history requirements
- All modules → audit_logs (foreign-keyed relationship). — SDD Ch.12; `docs/database.md`

### Realtime requirements
- Database change events (Postgres-level) must be consumable by the realtime layer. — SDD Ch.11 §11.9, Ch.13 §13.6

### Migrations
- Schema changes must use migrations (no ad hoc DDL). — `.claude/rules/database.md`

### Data retention
- DPDP (India's Digital Personal Data Protection Act) requires purpose limitation, minimization, and defined retention/secure deletion. — SDD Ch.17.4

### Relationships
- Student → Parents; Student → Leave Requests; Leave Request → Approval; Student → Library Passes; Library Pass → Journey Events; Journey Event → QR Session; Student → Notifications; all modules → Audit Logs. — SDD Ch.12; `docs/database.md`

### Indexing
- Roll number, approval status, journey status, notification status, timestamps, foreign keys. — SDD Ch.12; `docs/database.md`

## Security

### Platform attestation
- Android Play Integrity, iOS DeviceCheck/App Attest, mandatory per ADR-003, inserted into the parent device-trust flow. — SDD Ch.17.2.8; ADR-003

### Device trust
- Trusted-device binding as the primary anti-impersonation control for parents. — SDD Ch.4, Ch.17.2

### Authentication
- Identity/session: Supabase Auth (ADR-014). Business-authorization gates on top: OTP-gated roll-number verification, device trust, biometric, platform attestation. SIM verification remains an open feasibility question. — SDD Ch.4, Ch.17.2; ADR-003, ADR-014

### Authorization
- RBAC enforced server-side; never trust client-provided role/ownership claims. — SDD Ch.17.1; `.claude/rules/security.md`

### Encryption
- Encrypted sensitive data at rest, encrypted client-local storage, TLS 1.3 in transit, key rotation. — SDD Ch.12, Ch.17.3

### Secrets management
- Never expose service-role keys, DB credentials, or tokens; environment-variable based secrets. — SDD Ch.17.3; `CLAUDE.md`, `.claude/rules/security.md`, `.claude/rules/git.md`

### QR security
- Server-generated, signed, short-expiry (30–60s), one-time-use, replay-protected (nonce/timestamp), idempotent where applicable. — SDD Ch.6 §6.3, Ch.17.3

### Replay protection
- Explicit requirement for dynamic QR sessions. — SDD Ch.17.3

### Auditability
- Every sensitive operation must be auditable. — SDD Ch.17.1; `.claude/rules/security.md`

### Privacy
- Geolocation only during active incidents, auto-stopped on resolution. — SDD Ch.2 FR-012, Ch.6

### OWASP/STRIDE requirements
- STRIDE threat mapping (spoofing/tampering/repudiation/info-disclosure/DoS/elevation-of-privilege) with named mitigations per threat. OWASP Mobile/API Top 10 mapping required. — SDD Ch.17.4

### DPDP requirements
- Consent, purpose limitation, data minimization, defined retention, secure deletion. — SDD Ch.17.4

## Deployment

### Development
- Replit as the development-workflow tool (explicitly dev-scoped, not production). — SDD Ch.1, Ch.3 §3.6, Ch.14 §14.2

### Staging / Production
- Standard environment separation (Development / Staging / Production). — `docs/deployment.md`

### CI/CD
- GitHub → automated build/test → Vercel → Supabase connection → health checks → production release. — SDD Ch.14 §14.4

### Observability
- Application logs/metrics for monitoring. — SDD Ch.14; `docs/deployment.md`

### Backups
- Backups/PITR (point-in-time recovery) for the database. — SDD Ch.12; `docs/database.md`

### Disaster recovery
- Restore testing required, not just backup existence. — SDD Ch.12

### Environment separation
- Branches: `main`, `develop`, `feature/*`, `hotfix/*`, `release/*`. — SDD Ch.14; `docs/deployment.md`

## Testing

### Unit
- Part of the standard testing pyramid. — SDD Ch.15

### Integration
- E.g. Student App ↔ backend integration. — SDD Ch.15

### API
- E.g. Leave approval API tested at the API layer. — SDD Ch.15

### Database
- Migration checks, RLS verification. — `.claude/rules/database.md`, `.claude/rules/testing.md`

### Security
- Explicit security testing layer (e.g. authentication testing), penetration testing before major releases. — SDD Ch.15, Ch.17.4

### Mobile
- E.g. QR validation logic as a unit-test target within the mobile/library flow. — SDD Ch.15

### E2E
- E.g. full library journey as an E2E test target. — SDD Ch.15

### Performance
- Concurrent approvals, QR scans, and realtime load as explicit performance-testing targets; target KPIs from Ch.18 (<500ms API, 99.9% uptime, <2s realtime latency) provide performance budgets. — SDD Ch.15, Ch.18
