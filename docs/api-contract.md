# API Contract Reference

The SDD specifies RESTful resource-oriented APIs under `/api/v1`, JSON payloads, HTTPS, idempotency where applicable, and consistent status/error handling.

Authentication/authorization:
- JWT
- RBAC
- trusted-device verification for parents
- biometric-backed sensitive operations

Endpoint families from the SDD:
- `/api/v1/auth/*`
- `/api/v1/leave/*`
- `/api/v1/library/*`
- `/api/v1/notifications`
- `/api/v1/profile`
- `/api/v1/audit`

Expected errors include 400, 401, 403, 404, 409, and 500.

Realtime is expected for approval updates, library journey events, notifications, and dashboard changes.

OpenAPI is the source contract when implemented in the repository; generated Zod/client artifacts must be regenerated after contract changes.

## Implemented today

`packages/api-spec/openapi.yaml` is the actual source contract. As of Parent Leave Approval and Student Leave Request creation/viewing, it defines:

- `GET /api/v1/healthz`
- `POST /api/v1/leave-requests` — authenticated student creates a leave request for themselves (`201`, initial state `pending`)
- `GET /api/v1/leave-requests` — authenticated student's own leave requests, newest first
- `GET /api/v1/leave-requests/{leaveRequestId}` — authenticated owning student, OR authenticated parent/guardian, relationship-checked (404 for both nonexistent and unrelated/not-owned — anti-enumeration)
- `GET /api/v1/leave-requests/{leaveRequestId}/events` — same authorization/anti-enumeration shape as the GET above; returns the leave request's immutable approval-event timeline (`leave_approval_events`, ADR-015), oldest first, never including which specific parent/guardian/staff member acted (Approval History, Phase 4 Prompt 10 — see `apps/parent-mobile/docs/approval-history.md`)
- `POST /api/v1/leave-requests/{leaveRequestId}/approve`
- `POST /api/v1/leave-requests/{leaveRequestId}/reject`

Both decision endpoints require a `biometricAssertion` in the request body and remain parent/guardian-only — a student can never approve, reject, or otherwise transition their own request (`docs/leave-approval-workflow.md`). `POST /leave-requests` never accepts a client-supplied student id; the authenticated caller's own resolved student profile is always used. All leave-request request bodies are strictly validated (`additionalProperties: false`) — an unrecognized field is rejected with `400`, not silently ignored. Errors use a consistent `{ error: { code, message } }` shape (409 responses additionally include `currentStatus`). Full design: `docs/leave-approval-workflow.md`.

No other endpoint family listed above (`/auth/*`, `/library/*`, `/notifications`, `/profile`, `/audit`) is implemented yet — do not assume they exist merely because the SDD specifies them (`docs/current-state.md`).
