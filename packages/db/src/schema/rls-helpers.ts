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
