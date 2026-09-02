# Architecture Reference

The SDD describes a modular service-oriented backend with shared authentication, notifications, audit, realtime, and synchronization capabilities. It also specifies a modular-monolith approach initially, with clear boundaries for possible future extraction.

High-level flow:

Clients → API Gateway → Authentication/Authorization → Business Services → Supabase PostgreSQL/Realtime/Storage.

Core services:
- Authentication
- Leave Approval
- Library Pass
- Notification
- Realtime
- Audit
- Synchronization
- SAP integration for MVP

Request lifecycle:
Client → API Gateway → Authentication → Authorization → Business Service → Database Transaction → Realtime Event → Audit Log → Response.

Do not introduce microservices merely because modules are separate.
