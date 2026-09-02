# Database Reference

The SDD specifies Supabase PostgreSQL with logical modules for:
- Student Management
- Parent/Guardian Accounts
- Trusted Devices
- Leave Requests
- Parent Approval History
- Digital Library Pass
- Journey Events
- Dynamic QR Sessions
- Notifications
- Audit Logs
- Security Incidents

Core tables:
students, parents, trusted_devices, leave_requests, approvals, library_passes, journey_events, qr_sessions, notifications, audit_logs, security_incidents.

Important relationships:
Student → Parents
Student → Leave Requests
Leave Request → Approval
Student → Library Passes
Library Pass → Journey Events
Journey Event → QR Session
Student → Notifications
All modules → Audit Logs

Indexing areas include roll number, approval status, journey status, notification status, timestamps, and foreign keys.

Security: RLS, encrypted sensitive data, least privilege, audit logging, backups/PITR and restore testing.
