# Testing Rules

Use a layered testing model:
Unit → Integration → API → E2E → UAT.

Also apply:
- Security testing
- Performance testing
- Regression testing

Every task must have verification appropriate to its impact.

A failed check enters the loop:
FAIL → diagnose → minimal fix → rerun → regression check.

Never:
- delete tests to pass;
- weaken assertions without evidence;
- disable typechecking/linting/security checks to hide failures;
- mock away the behavior being tested;
- claim a test passed when it was not run.

If no relevant test exists, report `NOT AVAILABLE` and add a test when the task reasonably requires one.

Release-level acceptance requires critical defects resolved, regression passing, security validation, performance targets, and UAT as defined by the SDD/certification plan.
