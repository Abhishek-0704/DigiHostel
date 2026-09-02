# API Rules

API style:
- REST
- JSON
- `/api/v1`
- HTTPS in deployed environments
- JWT authentication
- RBAC authorization
- consistent HTTP status/error responses
- idempotency where applicable
- pagination where applicable

The OpenAPI contract is the shared API contract.

When changing it:
1. Update the source specification.
2. Regenerate Orval/Zod/client artifacts.
3. Typecheck affected packages.
4. Verify affected consumers.

Do not permanently hand-edit generated API files.

Known endpoint families from the SDD include authentication, leave, library, notifications, profile, and audit.
