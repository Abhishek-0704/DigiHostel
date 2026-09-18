import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

// Shared RLS policy fragments (docs/rls-policy-matrix.md).
//
// These call SECURITY DEFINER helper functions (created by a hand-written
// prelude in supabase/migrations, see that file's header comment) rather
// than inlining raw cross-table subqueries. Reason, found empirically while
// testing this schema against a real local Postgres instance:
//
// 1. A raw subquery against `staff` inside one of `staff`'s OWN policies
//    causes "infinite recursion detected in policy for relation staff" —
//    evaluating the policy requires re-evaluating staff's RLS.
// 2. Less obviously: `students` and `parent_student_relationships` policies
//    that reference EACH OTHER via raw EXISTS subqueries (students checks
//    psr for "am I linked", psr checks students for "is this my hostel")
//    form the same kind of cycle across two tables, not just one.
//
// SECURITY DEFINER functions owned by the table owner bypass RLS for their
// internal lookup (Postgres does not subject a table's own owner to RLS
// unless FORCE ROW LEVEL SECURITY is set, which is not set here) — the
// standard, well-established fix for this whole class of bug. Used
// uniformly, not just where strictly required, so the policy set is robust
// by construction rather than "correct by accident."
//
// Per the Critical Rule (docs/auth-database-security-model.md, ADR-014,
// ADR-015): these resolve the caller's OWN profile id from auth.uid(), or a
// specific narrow relationship fact, via a live lookup — never a JWT claim.

export const callerParentId = sql`public.current_parent_id()`;
export const callerStudentId = sql`public.current_student_id()`;
export const callerStaffId = sql`public.current_staff_id()`;
export const callerStaffRole = sql`public.current_staff_role()`;
export const callerStaffHostelId = sql`public.current_staff_hostel_id()`;

export const isSuperAdmin = sql`${callerStaffRole} = 'super_admin'`;
export const isHostelAdmin = sql`${callerStaffRole} = 'hostel_admin'`;
export const isReception = sql`${callerStaffRole} = 'reception_warden'`;
export const isLibraryIncharge = sql`${callerStaffRole} = 'library_incharge'`;
export const isAnyStaff = sql`public.current_staff_id() is not null`;

// Breaks the students <-> parent_student_relationships cycle specifically —
// both directions of that one relationship must go through bypass functions.
export const isParentLinkedToStudent = (studentId: AnyPgColumn | SQL) =>
  sql`public.is_parent_linked_to_student(${studentId})`;
export const isHostelAdminForStudent = (studentId: AnyPgColumn | SQL) =>
  sql`public.is_hostel_admin_for_student(${studentId})`;
// F-05A: reception_warden is hostel-scoped, same shape as hostel_admin above
// (docs/rls-policy-matrix.md), but security_incidents has no hostel_id
// column of its own — same join-through-students requirement that forced
// isHostelAdminForStudent to exist as a SECURITY DEFINER function rather
// than an inline subquery.
export const isReceptionForStudent = (studentId: AnyPgColumn | SQL) =>
  sql`public.is_reception_for_student(${studentId})`;

// QG-03 remediation, F-QG03-01: `parents` has no hostel_id column of its own
// AND no direct student_id column — a parent's hostel relevance is only
// derivable by joining through parent_student_relationships -> students.
// `parents_all_hostel_admin` previously used a bare `isHostelAdmin` role
// check (no scoping at all — the original, unfixed-since-migration-0000
// defect QG-03 found live: a cross-hostel hostel_admin could read AND write
// every parent record system-wide). A parent CAN legitimately be linked to
// students in more than one hostel (the schema places no such constraint on
// parent_student_relationships) — this helper's EXISTS semantics correctly
// allow EITHER hostel's hostel_admin to see/manage such a parent (mirroring
// parent_student_relationships' own existing psr_all_hostel_admin behavior,
// which already grants each hostel's admin access to the relationship row
// for their own hostel's student regardless of the parent's other links),
// while still denying a hostel_admin with NO linked student at all.
export const isHostelAdminForParent = (parentId: AnyPgColumn | SQL) =>
  sql`public.is_hostel_admin_for_parent(${parentId})`;

// QG-03 remediation, F-QG03-02: qr_sessions/journey_events (dormant Library
// schema) reference a library_pass, not a student directly — a reception
// staff member's hostel relevance is only derivable by joining through
// library_passes -> students. Mirrors isReceptionForStudent's exact shape,
// one join-hop further. library_incharge remains intentionally GLOBAL
// (unchanged) — only reception_warden's access is scoped by this helper.
export const isReceptionForLibraryPass = (libraryPassId: AnyPgColumn | SQL) =>
  sql`public.is_reception_for_library_pass(${libraryPassId})`;
