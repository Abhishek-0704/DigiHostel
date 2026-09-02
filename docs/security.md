# Security Architecture Reference

The SDD security principles are:
- Zero Trust
- Least Privilege
- Defense in Depth
- Secure by Default
- Privacy by Design
- Fail Securely
- Continuous Monitoring

Security flow:
TLS → JWT validation → RBAC → business logic → audit → response.

Defense layers:
- TLS/network protection
- JWT/OTP identity
- trusted device
- RBAC/input validation
- database RLS/encryption
- audit/monitoring

Threat model:
- Spoofing → trusted devices/biometrics
- Tampering → signed QR/integrity checks
- Repudiation → audit logs
- Information disclosure → encryption/RLS
- DoS → rate limiting
- Elevation of privilege → RBAC

Dynamic QR security requires server generation, short expiry, one-time use/replay protection, nonce/timestamp validation and idempotency where applicable.

Security lifecycle:
Requirements → Secure Design → Development → Code Review → Security Testing → Deployment → Monitoring.
