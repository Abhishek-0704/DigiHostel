# Implementation Baseline

This document defines the clean-start contract for DigiHostel implementation following the intentional reset of the previous Replit-generated application (see `docs/current-state.md` and `docs/change-log.md`).

## Source of Truth Hierarchy

When sources conflict, resolve in this order, highest first:

1. **Approved ADRs** (`docs/adr/`, status `ACCEPTED`)
2. **SDD** (`sdd/`)
3. **`CLAUDE.md`**
4. **`.claude/rules/`**
5. **`.claude/skills/`**
6. **`.claude/agents/`**
7. **`docs/`** (supporting project documentation)
8. **Implementation code**

When an implementation decision conflicts with an approved ADR, the ADR wins unless deliberately superseded through the process defined in `docs/adr/README.md`. An ADR resolving an SDD ambiguity outranks the SDD's unresolved text for implementation purposes, without modifying the SDD itself.

## Clean-Start Rule

The new application must be implemented from the specification (`sdd/`) and approved ADRs (`docs/adr/`).

The deleted Replit implementation (former `artifacts/`, `lib/`, `scripts/` directories and their contents) MUST NOT be used as:

- source code
- architecture reference
- dependency reference
- database reference
- API reference
- UI reference
- implementation baseline

Git history containing that implementation (commits prior to and including `a0df538`) may be consulted only for historical/audit purposes — e.g., understanding what was previously attempted, when investigating this project's own history. It must never be treated as an implicit implementation source, copied from, or used to justify a design choice merely because "that's what was there before."

## Implementation Status

**Implementation has not started.**

There is currently no application source code, backend, frontend/mobile app, database schema, Supabase configuration, authentication, API, realtime layer, notification service, QR workflow, biometric integration, or deployment configuration in this repository. See `docs/current-state.md` for the full, current verified state.

## Governance Enforcement

The rule that accepted ADRs are authoritative and cannot be silently modified is enforced at the governance layer — see `CLAUDE.md` and `.claude/rules/`. The full lifecycle, supersession, and immutability policy lives in `docs/adr/README.md`; this document does not duplicate it.
