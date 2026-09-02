# DigiHostel Task Workflow

Every implementation task follows:

UNDERSTAND → INSPECT → PLAN → IMPLEMENT → TEST → VERIFY → FIX → RETEST → REGRESSION CHECK → DIFF REVIEW → FINAL REPORT

## 1. Understand
Identify the requested outcome, affected package/application, acceptance criteria, dependencies, security implications, and related workflows.

## 2. Inspect
Read only relevant code first. Inspect existing implementation, API contract, schema, generated code, tests, and consumers. Reuse existing functionality.

## 3. Plan
Choose the smallest safe implementation. Do not expand scope or redesign unrelated architecture.

## 4. Implement
Make the requested change while preserving contracts, security boundaries, user changes, and project conventions.

## 5. Test
Run the smallest meaningful verification, then broaden it when the change has shared impact.

Typical checks:
- `pnpm run typecheck`
- package tests
- API tests
- database/migration checks
- build
- integration/E2E/security/performance tests as applicable

## 6. Failure loop
If any check fails:
1. Read the actual failure.
2. Identify the root cause.
3. Make the minimum corrective change.
4. Re-run the failed check.
5. Repeat until it passes or a genuine blocker requires a decision.

Never hide failures, weaken checks, delete tests, or claim success without evidence.

## 7. Regression
Broaden verification when changing shared code:
- API contract → generated artifacts → consumers
- DB schema → migrations → queries → APIs → workflows
- auth → authorization → isolation → integration
- realtime/events → publishers → subscribers → recovery

## 8. Diff review
Run:
- `git status`
- `git diff`

Check for unrelated changes, secrets, debug code, unintended generated files, and accidental refactors.

## 9. Final completion
A task is complete only when:
- requested behavior is implemented;
- relevant verification passes;
- no unresolved task-scoped errors remain;
- no unauthorized architecture/security changes were made;
- the diff was reviewed.

Report:
- Implemented
- Files changed
- Verification results
- Fix/retest history
- Regression checks
- Remaining issues

If incomplete, report `Task Blocked`, not `Task Complete`.
