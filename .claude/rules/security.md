# Security Rules

Security is a first-class requirement.

Apply:
- Zero Trust
- Least Privilege
- Defense in Depth
- Secure by Default
- Privacy by Design
- Fail Securely
- Continuous Monitoring

Request path:
TLS → authentication → authorization/RBAC → business validation → database/RLS → audit → response.

Never:
- expose secrets, service-role keys, DB credentials, or tokens;
- bypass authorization;
- disable RLS to solve application bugs;
- trust client-provided roles or ownership;
- log credentials or sensitive tokens;
- weaken QR expiry/replay protection;
- use temporary geolocation outside the specified incident workflow.

Sensitive operations must be auditable. Security-sensitive changes require negative-path tests, not only happy-path tests.
