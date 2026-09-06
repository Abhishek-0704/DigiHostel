-- PRR Finding F-05A remediation (identified during the F-05 audit).
--
-- Prior state (the vulnerability): `security_incidents_all_reception_library`
-- combined reception_warden and library_incharge under one policy using
-- `public.current_staff_role() = 'reception_warden' or
-- public.current_staff_role() = 'library_incharge'` — a pure role-membership
-- OR with no hostel-scope join for reception at all. docs/rls-policy-matrix.md
-- documents reception as own-hostel scoped (same basis as the students table's
-- own `students_select_own_hostel_reception` policy) and library_incharge as
-- intentionally global. Since the policy was `for: "all"`, any authenticated
-- reception_warden, from any hostel, had full SELECT/INSERT/UPDATE/DELETE
-- access to every OTHER hostel's security_incidents rows too, including
-- reassigning an incident's student_id into another hostel undetected.
-- Confirmed live, pre-fix, against a disposable local instance with genuine
-- distinct non-privileged actor sessions.
--
-- Remediation: split into two policies, matching the existing precedent
-- already used for these same two roles on the `students` table
-- (students_select_own_hostel_reception / students_select_library_incharge)
-- rather than one combined OR expression. library_incharge's global access
-- is completely unchanged. Reception's new policy reuses the same
-- SECURITY DEFINER join-through-students pattern F-05 already established
-- for hostel_admin (is_hostel_admin_for_student) — security_incidents has no
-- hostel_id column of its own, so the join must go through students, and a
-- raw subquery here would be a stylistic inconsistency with the rest of this
-- file, not a functional necessity (no recursion risk exists for this
-- specific join direction), but a dedicated function keeps the policy set
-- uniform (rls-helpers.ts's own stated rationale: "used uniformly, not just
-- where strictly required").
DROP POLICY "security_incidents_all_reception_library" ON "security_incidents" CASCADE;--> statement-breakpoint

-- Hand-added; Drizzle's schema DSL (this version) has no CREATE FUNCTION
-- support — matching the established precedent of hand-appending raw SQL
-- this schema can't express (see the CREATE FUNCTION prelude in
-- 0000_cute_korvac.sql and the trigger added directly to
-- 0003_f01_trusted_devices_rls_remediation.sql). SECURITY DEFINER, owned by
-- the migration-running role (the table owner), pinned search_path,
-- schema-qualified reference to students — identical shape to
-- is_hostel_admin_for_student, differing only in the role compared.
CREATE FUNCTION public.is_reception_for_student(p_student_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  select public.current_staff_role() = 'reception_warden' and exists (
    select 1 from students s where s.id = p_student_id and s.hostel_id = public.current_staff_hostel_id()
  )
$$;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.is_reception_for_student(uuid) TO authenticated, anon;--> statement-breakpoint

CREATE POLICY "security_incidents_all_reception" ON "security_incidents" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.is_reception_for_student("security_incidents"."student_id")) WITH CHECK (public.is_reception_for_student("security_incidents"."student_id"));--> statement-breakpoint
CREATE POLICY "security_incidents_all_library" ON "security_incidents" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'library_incharge') WITH CHECK (public.current_staff_role() = 'library_incharge');
