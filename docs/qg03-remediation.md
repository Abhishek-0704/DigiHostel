# QG-03 Remediation Record

This document records the remediation of the findings from the independent
**QG-03 — Student Operations, Emergency & Health Systems Review**, which
returned a verdict of **❌ FAILED — REQUIRES ARCHITECTURAL REWORK**, driven
by one confirmed CRITICAL finding (F-QG03-01) plus one MAJOR finding
(F-QG03-02) and one MAJOR testing-process finding (F-QG03-03).

This document does not rewrite or reinterpret the original QG-03 review —
that review's own findings, evidence, scorecards, and verdict remain the
authoritative historical record of what was found and why. This document
records only what was subsequently done about it.

---

## F-QG03-01 — `parents_all_hostel_admin` unscoped RLS (CRITICAL)

**Status: CLOSED**

### Original defect

`parents_all_hostel_admin` (`packages/db/src/schema/identity.ts`, present
unfixed since `supabase/migrations/0000_cute_korvac.sql`) was a single
`for: "all"` policy using a bare `current_staff_role() = 'hostel_admin'`
check — no join against which hostel the parent's own linked students
actually belong to.

### Evidence (live, pre-fix)

The QG-03 review board reproduced this live using genuine, unmodified,
password-authenticated `hostel_admin` sessions (no forged JWTs):
`hosteladmin2@example.test` (Utkal-scoped) read every parent record in the
system, including a Kalinga parent's full name and phone number, and
successfully overwrote that Kalinga parent's `phone_number` via a direct
PostgREST `PATCH` — the write persisted and was independently re-confirmed
via a service-role re-read. Test data was reverted immediately; the local
database was subsequently reset before remediation began.

### Remediation

`supabase/migrations/0019_fqg0301_fqg0302_hostel_scope_remediation.sql`
drops the single unscoped policy and replaces it with three per-operation
policies (SELECT/UPDATE/DELETE), each using a new SECURITY DEFINER helper,
`public.is_hostel_admin_for_parent(p_parent_id uuid)`, which joins
`parent_student_relationships` → `students` → `hostel_id`. **No INSERT
policy exists for hostel_admin at all** — a brand-new `parents` row has no
relationship row yet to scope against (that relationship can only be
created after the parent exists), and no legitimate product workflow needs
hostel_admin to directly insert a parent record (parent registration is
exclusively the Parent App's own OTP/eligibility flow, which uses Fastify's
service-role connection and bypasses RLS entirely — this fix has zero
effect on that path).

### Security invariant

> A `hostel_admin` may read, update, or delete a `parents` record only when
> that parent has at least one `parent_student_relationships` row linking
> them to a student in the caller's own authorized hostel. A parent linked
> to students in more than one hostel is correctly visible to EACH of those
> hostels' admins (mirroring `parent_student_relationships`' own
> pre-existing `psr_all_hostel_admin` behavior for the identical case). No
> hostel_admin may directly INSERT a new `parents` row under any
> circumstance.

### Test coverage

- `supabase/tests/database/22_fqg0301_parents_hostel_scope.sql` — 26 pgTAP
  assertions: same-hostel positive (SELECT + legitimate UPDATE), cross-hostel
  negative for SELECT/UPDATE/DELETE/INSERT (including the exact write the
  live attack proved possible pre-fix), an unrelated-parent negative,
  enumeration-leak guard, role-switching (identity-driven, not a fluke),
  the multi-hostel-parent edge case (both hostels' admins correctly
  retain access), and regression checks for reception (still zero access),
  library_incharge (still zero access), super_admin (unchanged), and
  self-access (`parents_select_own`/`parents_update_own`, unchanged).
- Live PostgREST re-verification (`fqg0301_live_verify.py`, scratchpad,
  not committed): same-hostel read/update confirmed working; cross-hostel
  read/update/delete/insert all confirmed denied; the Utkal parent's record
  independently re-read via service-role and confirmed byte-identical
  before and after every attack attempt.

### Application regression

`GET /students/{rollNumber}` (Fastify, service-role connection, bypasses
RLS by design per ADR-006/ADR-014) is architecturally unaffected by this
change — confirmed by source inspection (no direct-client/RLS-scoped read
of `parents` exists anywhere in `apps/api`) and empirically via a live
browser session: Student Profile's and Health Case Detail's own
"Parent / Guardian" sections both rendered the correct, uncorrupted
guardian data (`Test Father One`/`Test Mother One`, correct phone numbers)
after the migration was applied.

---

## F-QG03-02 — Dormant Library schema unscoped reception RLS (MAJOR)

**Status: CLOSED**

### Original defect

`qr_sessions_all_reception_library`, `journey_events_select_reception_library`,
and `journey_events_insert_reception_library` (`packages/db/src/schema/library.ts`,
present unfixed since `0000_cute_korvac.sql`) granted `reception_warden`
access via a bare `current_staff_role() = 'reception_warden' or
current_staff_role() = 'library_incharge'` check — no hostel join for
reception at all, unlike this same file's own `library_passes_all_reception`
policy, which was already correctly scoped from the start.

### Why this was MAJOR, not CRITICAL

Confirmed by repository-wide search: **zero Fastify routes read or write
`qr_sessions` or `journey_events` today.** This domain is entirely dormant
— pre-provisioned since the original scaffolding, never activated. The
defect was therefore not exploitable through the certified Reception
Dashboard application, only via direct PostgREST against schema with no
current product surface.

### Remediation

The same migration (`0019_...`) drops the three combined policies and adds
a new SECURITY DEFINER helper, `public.is_reception_for_library_pass(p_library_pass_id uuid)`,
which joins `library_passes` → `students` → `hostel_id`. Each combined
policy is split into a reception policy (scoped via the new helper) and an
unchanged, intentionally global `library_incharge` policy — mirroring
`library_passes_all_reception`'s own established shape and the F-05A
precedent for this exact class of fix. The pre-existing forged-actor
(`verified_by_staff_id = current_staff_id()`) and forged-attestation
(`biometric_confirmed = true`) checks on `journey_events` INSERT are
preserved unmodified.

### Security invariant

> A `reception_warden` may access a `qr_sessions`/`journey_events` row only
> when its `library_pass_id` resolves (via `library_passes.student_id`) to
> a student in the caller's own authorized hostel. `library_incharge`
> remains intentionally global, unchanged.

### Test coverage

- `supabase/tests/database/23_fqg0302_library_dormant_rls_hardening.sql` —
  25 pgTAP assertions, inserting a complete self-contained fixture set
  (this domain has no seed data) covering: same-hostel positive
  (SELECT + legitimate UPDATE/INSERT) and cross-hostel negative for
  `qr_sessions` (SELECT/UPDATE) and `journey_events`
  (INSERT/SELECT), forged-actor and forged-biometric-attestation regression
  checks (proving the pre-existing checks survived the policy split),
  library_incharge global-access regression, super_admin regression,
  own-student/linked-parent regression, and a `library_passes` regression
  check (the policy this fix's scope was always meant to match, confirmed
  untouched).
- Live PostgREST re-verification (`fqg0302_live_verify.py`, scratchpad, not
  committed, fixtures inserted and cleaned up within the script): same-hostel
  read confirmed working; cross-hostel `qr_sessions` read/update and
  `journey_events` insert all confirmed denied; independent service-role
  re-read confirmed the cross-hostel `qr_sessions` row unchanged.

### Application regression

None possible to regress — no route consumes these tables. Full workspace
`typecheck`/`lint`/`build`/test suite re-verified clean regardless (see
`qg03-remediation` test results below).

### Note for future Library Operations work

The `hostel_admin`/`parent`/`student` rows of `docs/rls-policy-matrix.md`'s
`library_passes`/`journey_events` section were **not** independently
re-verified against the live SQL as part of this remediation — they reflect
carried-over design documentation. Whoever activates Library Operations
should re-verify the full policy set (not just the two rows this
remediation touched) before wiring any Library route to these tables.

---

## F-QG03-03 — `parents` had zero adversarial pgTAP coverage (MAJOR)

**Status: CLOSED**

### Original defect

No pgTAP test file exercised `parents`' cross-hostel `hostel_admin`
behavior at all — the only reference to `parents` anywhere in the 22
pre-remediation pgTAP files was an incidental hit in the anonymous-denial
test. This coverage gap is why F-QG03-01 was never caught by the pre-existing
274-assertion pgTAP suite, and directly matches the review's own
"high test counts can hide fixture bias" concern.

### Remediation

`supabase/tests/database/22_fqg0301_parents_hostel_scope.sql` (26
assertions) and `supabase/tests/database/23_fqg0302_library_dormant_rls_hardening.sql`
(25 assertions) add dedicated, adversarial, cross-hostel coverage for
`parents`, `qr_sessions`, and `journey_events`, following the same rigor and
harness style as `13_f05_security_incidents_hostel_scope.sql`. Full pgTAP
suite: **325/325** (was 274/274; +51 new assertions), reproducible on a
clean `supabase db reset`.

### Regression property proven

`22_fqg0301_parents_hostel_scope.sql`'s core assertions ("hostel_admin1
(Kalinga): CANNOT read student2's guardian", "UPDATE on the Utkal-only-linked
parent affected zero rows... this is the exact write the live PostgREST
attack proved possible pre-fix") directly reproduce the essential security
property the original defect violated — a `hostel_admin` from one hostel
must never read or mutate a parent associated exclusively with another
hostel — and would have failed against the pre-remediation policy.

---

## F-QG03-09 — `parent_student_relationships` hostel-isolation bypass (CRITICAL, discovered by independent QG-03 re-verification)

**Status: CLOSED**

### Original finding

An independent QG-03 re-verification board (conducted after the F-QG03-01/02/03
remediation above) found that the *direct* `parents` bypass (F-QG03-01) was
genuinely fixed, but the underlying hostel-isolation invariant could still be
defeated indirectly. `psr_all_hostel_admin` (`parent_student_relationships`,
present, unmodified, since `0000_cute_korvac.sql`) was a `for: "all"` policy
scoped only by the student side (`isHostelAdminForStudent`), with no
validation of the parent side at all. Live-reproduced: a genuine Kalinga
`hostel_admin` session, given only the UUID of a parent with no legitimate
relationship to any Kalinga student, INSERTed a fabricated
`parent_student_relationships` row linking that parent to one of the admin's
own students. The fabricated row satisfied `parents`' own
`is_hostel_admin_for_parent` check, and the same session then SELECTed and
UPDATEd (a forged phone number, persisted, independently re-confirmed via a
service-role re-read, then reverted) the previously-inaccessible parent —
fully reinstating the cross-hostel PII read+write impact F-QG03-01 was
remediated to eliminate, via a sibling table neither the original QG-03
review nor the F-QG03-01 remediation had examined as part of that specific
attack surface.

### Relationship lifecycle reconnaissance

Before any code change, an exhaustive repository search for every writer of
`parent_student_relationships` was performed (schema, migrations, backend
repositories/services/routes, frontend, seed data, test fixtures). Finding:
**no legitimate product workflow writes to this table anywhere in the
current implementation.** Fastify (`apps/api`) only ever `SELECT`s it
(`eligibilityRepository.ts` — OTP eligibility resolution; `db-port.ts` —
trusted-device/auth lookups; `student/repository.ts` — `GET
/students/{rollNumber}` guardian enrichment; `leave/repository.ts` —
parent-decision-authority check; `notification/repository.ts` — escalation
recipient resolution), always via its service-role connection, which bypasses
RLS entirely and is therefore completely unaffected by this remediation. No
`apps/reception-dashboard` source file references this table at all — no UI
exists to create, edit, or delete a relationship. The Parent App
(`apps/parent-mobile`) only reads its own linked relationships. Every
INSERT/DELETE against this table anywhere in the repository is either
`supabase/seed.sql` or `*.integration.test.ts` fixture setup, both via the
service-role connection.

### Remediation

`supabase/migrations/0020_fqg0309_psr_hostel_admin_write_lockdown.sql` drops
`psr_all_hostel_admin` and replaces it with a single SELECT-only policy,
`psr_select_hostel_admin` (identical `USING` expression —
`is_hostel_admin_for_student(student_id)` — unchanged read behavior).
`hostel_admin`'s INSERT/UPDATE/DELETE authority on this table is removed
entirely — mirroring the exact "no legitimate workflow = no policy, deny
outright" precedent the 0019 migration already established for `parents`
INSERT, rather than a narrower "validate both sides of the relationship"
heuristic for a write capability nothing legitimate uses. This closes not
only the INSERT-fabrication vector the exploit used, but also the
UPDATE-based ownership-mutation vector (re-pointing an existing legitimate
relationship's `parent_id`/`student_id` across the hostel boundary) and any
DELETE vector — none of which were live-exploited, but all of which were
reachable via the same now-removed grant.

### Security invariant

> A `hostel_admin` cannot create, modify, or delete any
> `parent_student_relationships` row, under any circumstance. Only
> `super_admin` (unscoped, unchanged, existing design) may write to this
> table via RLS; every other legitimate write in the system happens through
> the service-role connection (seed data, or a future trusted backend
> workflow), which is architecturally exempt from RLS. `hostel_admin`
> retains only its pre-existing, correctly-scoped SELECT.

### Multi-hostel-parent semantics

Unaffected — the only change is to write authority; the unmodified
`psr_select_hostel_admin` `USING` expression continues to let each relevant
hostel's admin read the relationship row for their own hostel's student,
exactly as before, including for a parent linked to students in more than
one hostel.

### Test coverage

- `supabase/tests/database/24_fqg0309_psr_hostel_admin_write_lockdown.sql` —
  22 pgTAP assertions covering: the exact exploit (fabrication INSERT denied,
  A), legitimate own-hostel SELECT preserved (B), foreign-parent/foreign-student
  and own-parent/foreign-student INSERT denial (C, D), the downstream
  SELECT/UPDATE-on-`parents` chain remaining broken even after a failed
  fabrication attempt (E, F), UPDATE-based ownership mutation of `parent_id`
  and `student_id` on a legitimate relationship (G, H — ordinary UPDATE/DELETE
  RLS semantics: zero applicable policies means the statement succeeds but
  affects zero rows, not an exception, verified via service-role re-read, not
  `throws_ok`), same-host and cross-host DELETE denial (I), a duplicate-of-
  legitimate INSERT attempt (J), the multi-hostel-parent regression (K), and
  the original F-QG03-01 direct-attack regression on `parents` itself (L).
  Full suite: **347/347** (was 325/325; +22), reproducible on a clean
  `supabase db reset`.
- Live PostgREST re-verification (`fqg0309_live_verify.py`, scratchpad, not
  committed): the exact exploit chain reproduced end-to-end (fabrication
  INSERT → `403`/`42501`; downstream SELECT/UPDATE on the target parent both
  still denied); ownership-mutation UPDATE (`parent_id`/`student_id`) and
  DELETE both confirmed to affect zero rows; the reciprocal direction (Utkal
  admin attacking a Kalinga-only parent) confirmed identical; the original
  F-QG03-01 direct attack re-confirmed blocked; the service-role
  student→relationship→parent join read (mirroring the real
  `eligibilityRepository` query shape) confirmed still working, unaffected;
  final row counts confirmed to match the seed baseline exactly (no residue).

### Application regression

None possible — Fastify's service-role connection bypasses RLS entirely and
never writes to this table. Full workspace test suite re-verified unchanged
(1564 passed, 6 skipped, 0 failed).

---

## Test Results Summary (post-remediation, including F-QG03-09)

- `supabase test db`: **347/347 PASS** (325/325 after F-QG03-01/02/03 + 22 new
  for F-QG03-09), reproducible on a clean `supabase db reset`.
- Live PostgREST adversarial verification: F-QG03-01, F-QG03-02, and
  F-QG03-09 scripts all passed every assertion; no data corruption remained
  afterward (independently re-confirmed via service-role reads; all
  script-created fixtures removed; final row counts matched the seed
  baseline exactly after the F-QG03-09 verification pass).
- Full workspace test suite: **1564 passed, 6 skipped, 0 failed** across
  192 files — identical to the pre-remediation baseline both after the
  F-QG03-01/02/03 pass and after the F-QG03-09 pass, confirming zero
  application-level regression at either stage (expected: Fastify's
  service-role connection bypasses RLS entirely, so none of these policy
  changes have any effect on any Fastify-mediated route).
- `typecheck` (all packages), `lint`, `build`: clean, both after the
  F-QG03-01/02/03 pass and after the F-QG03-09 pass.
- Live browser application regression: Student Profile and Health Case
  Detail's "Parent / Guardian" sections both confirmed rendering correct,
  uncorrupted data after the 0019 migration.

## Scope Discipline

The F-QG03-01/02/03 pass touched exactly: `packages/db/src/schema/{identity,library,rls-helpers}.ts`,
one new migration (`0019_fqg0301_fqg0302_hostel_scope_remediation.sql`),
`supabase/migrations/meta/_journal.json`, two new pgTAP files, and this
documentation plus the `docs/rls-policy-matrix.md` sections directly
describing the changed policies. The subsequent F-QG03-09 pass touched
exactly: `packages/db/src/schema/identity.ts` (the `parent_student_relationships`
policy block only), one new migration
(`0020_fqg0309_psr_hostel_admin_write_lockdown.sql`),
`supabase/migrations/meta/_journal.json`, one new pgTAP file
(`24_fqg0309_psr_hostel_admin_write_lockdown.sql`), and this documentation
plus the `docs/rls-policy-matrix.md` `parent_student_relationships` section.
No other finding from the QG-03 review
(F-QG03-04 through F-QG03-08) was addressed — those remain open exactly as
the original review classified them (see `docs/current-state.md`'s QG-03
remediation entry for the current status of each).
