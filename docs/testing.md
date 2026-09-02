# Testing Reference

The SDD testing pyramid is:
1. Unit
2. Integration
3. API
4. E2E
5. UAT

Additional testing:
- Security
- Performance/load
- Regression

Examples:
- QR validation logic → unit
- Student App ↔ backend → integration
- Leave approval API → API test
- Library journey → E2E
- Authentication → security testing
- concurrent approvals/QR scans/realtime → performance testing

Defect lifecycle:
New → Assigned → In Progress → Fixed → QA Verification → Closed.

If verification fails, return to development for correction.

Release acceptance requires critical defects resolved, regression tests passing, security validation, performance targets, and stakeholder UAT.
