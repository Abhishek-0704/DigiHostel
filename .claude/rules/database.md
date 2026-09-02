# Database Rules

Primary database: Supabase PostgreSQL.
Database abstraction: Drizzle, to be (re)created — no `lib/db` package currently exists (see `docs/current-state.md`). Do not assume any prior schema from the deleted implementation.

Canonical entity terminology: see `docs/adr/ADR-002-database-domain-model.md` (authoritative — supersedes the list below if they ever diverge).
students, parents, trusted_devices, leave_requests, approvals, library_passes, journey_events, qr_sessions, notifications, audit_logs, security_incidents.

Rules:
- Inspect existing schema before changing it.
- Use migrations for schema changes.
- Preserve foreign keys and data integrity.
- Evaluate RLS for every protected table.
- Do not disable RLS as a shortcut.
- Avoid destructive migrations.
- Prefer transactions for multi-step authoritative state changes.
- Consider idempotency for approvals and QR operations.
- Add indexes based on real query patterns.
- Never use production data casually in tests.
