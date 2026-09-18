-- QG-03 (Student Operations, Emergency & Health Systems Review) remediation.
--
-- ============================================================================
-- F-QG03-01 — CRITICAL. `parents_all_hostel_admin` (present, unfixed, since
-- the very first migration, 0000_cute_korvac.sql) used a bare
-- `current_staff_role() = 'hostel_admin'` role check — no join against which
-- hostel the parent's own linked students actually belong to. Since the
-- policy was `for: "all"` (SELECT/INSERT/UPDATE/DELETE), ANY hostel_admin,
-- from ANY hostel, had full CRUD over EVERY parent record system-wide.
--
-- Independently reproduced live, pre-fix, by the QG-03 review board using
-- genuine non-privileged actor sessions (real password-authenticated
-- hostel_admin accounts, no forged JWTs): a Utkal-scoped hostel_admin read
-- every parent row in the system (including a Kalinga parent's full name and
-- phone number) via direct PostgREST, and successfully overwrote that
-- Kalinga parent's phone_number — the write persisted and was independently
-- re-confirmed via a service-role re-read. Test data was reverted and the
-- database subsequently reset before this remediation began.
--
-- Remediation: split into three per-operation policies (SELECT/UPDATE/
-- DELETE), each scoped via a new SECURITY DEFINER helper,
-- is_hostel_admin_for_parent, joining parent_student_relationships ->
-- students -> hostel_id (parents has neither a hostel_id nor a student_id
-- column of its own). A parent CAN legitimately be linked to students in
-- more than one hostel — this helper's EXISTS semantics correctly allow
-- EITHER hostel's hostel_admin to see/manage such a parent (mirroring
-- parent_student_relationships' own pre-existing psr_all_hostel_admin
-- behavior for the identical multi-hostel-parent case), while still denying
-- a hostel_admin with no linked student to that parent at all.
--
-- Deliberately NO INSERT policy for hostel_admin: a brand-new `parents` row
-- has no parent_student_relationships row yet (that relationship can only be
-- created AFTER the parent exists, since psr.parent_id references
-- parents.id) — there is no way to scope an INSERT via this relationship at
-- insert-time, and no legitimate product workflow needs hostel_admin to
-- directly insert a parent row (parent registration is exclusively the
-- Parent App's own OTP/eligibility flow, apps/api/src/domain/auth/, which
-- uses Fastify's service-role connection and bypasses RLS entirely — this
-- change has zero effect on that path). Omitting the INSERT policy denies
-- every hostel_admin INSERT attempt outright (no matching policy = denied).
-- ============================================================================
DROP POLICY "parents_all_hostel_admin" ON "parents" CASCADE;--> statement-breakpoint

-- Hand-added; matches the established precedent (is_hostel_admin_for_student,
-- is_reception_for_student) of hand-appending raw SQL Drizzle's schema DSL
-- (this version) cannot express. SECURITY DEFINER, owned by the
-- migration-running role (the table owner), pinned search_path.
CREATE FUNCTION public.is_hostel_admin_for_parent(p_parent_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  select public.current_staff_role() = 'hostel_admin' and exists (
    select 1 from parent_student_relationships psr
    join students st on st.id = psr.student_id
    where psr.parent_id = p_parent_id and st.hostel_id = public.current_staff_hostel_id()
  )
$$;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.is_hostel_admin_for_parent(uuid) TO authenticated, anon;--> statement-breakpoint

CREATE POLICY "parents_select_hostel_admin" ON "parents" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.is_hostel_admin_for_parent("parents"."id"));--> statement-breakpoint
CREATE POLICY "parents_update_hostel_admin" ON "parents" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.is_hostel_admin_for_parent("parents"."id")) WITH CHECK (public.is_hostel_admin_for_parent("parents"."id"));--> statement-breakpoint
CREATE POLICY "parents_delete_hostel_admin" ON "parents" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.is_hostel_admin_for_parent("parents"."id"));--> statement-breakpoint

-- ============================================================================
-- F-QG03-02 — MAJOR. Dormant Library schema (`qr_sessions`, `journey_events`)
-- — pre-provisioned since migration 0000, never activated (zero Fastify
-- routes read/write either table today, confirmed by repository search), so
-- this was NOT exploitable through the certified Reception Dashboard
-- application. It IS an unsafe pre-provisioned direct-PostgREST boundary:
-- `qr_sessions_all_reception_library`, `journey_events_select_reception_library`,
-- and `journey_events_insert_reception_library` all granted reception_warden
-- access via a bare `current_staff_role() = 'reception_warden' or
-- current_staff_role() = 'library_incharge'` check — no hostel join for
-- reception at all, unlike this same file's own `library_passes_all_reception`
-- policy, which was already correctly scoped from the start.
--
-- Remediation: split each combined policy into a reception policy (scoped
-- via a new SECURITY DEFINER helper, is_reception_for_library_pass, joining
-- library_passes -> students -> hostel_id) and an unchanged, intentionally
-- global library_incharge policy — matching library_passes_all_reception's
-- own established shape and the F-05A precedent for this exact class of fix.
-- ============================================================================
DROP POLICY "qr_sessions_all_reception_library" ON "qr_sessions" CASCADE;--> statement-breakpoint
DROP POLICY "journey_events_insert_reception_library" ON "journey_events" CASCADE;--> statement-breakpoint
DROP POLICY "journey_events_select_reception_library" ON "journey_events" CASCADE;--> statement-breakpoint

CREATE FUNCTION public.is_reception_for_library_pass(p_library_pass_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  select public.current_staff_role() = 'reception_warden' and exists (
    select 1 from library_passes lp
    join students st on st.id = lp.student_id
    where lp.id = p_library_pass_id and st.hostel_id = public.current_staff_hostel_id()
  )
$$;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.is_reception_for_library_pass(uuid) TO authenticated, anon;--> statement-breakpoint

CREATE POLICY "qr_sessions_all_reception" ON "qr_sessions" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.is_reception_for_library_pass("qr_sessions"."library_pass_id")) WITH CHECK (public.is_reception_for_library_pass("qr_sessions"."library_pass_id"));--> statement-breakpoint
CREATE POLICY "qr_sessions_all_library_incharge" ON "qr_sessions" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.current_staff_role() = 'library_incharge') WITH CHECK (public.current_staff_role() = 'library_incharge');--> statement-breakpoint

CREATE POLICY "journey_events_insert_reception" ON "journey_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
  public.is_reception_for_library_pass("journey_events"."library_pass_id")
  and "journey_events"."verified_by_staff_id" = public.current_staff_id()
  and "journey_events"."biometric_confirmed" = true
);--> statement-breakpoint
CREATE POLICY "journey_events_insert_library_incharge" ON "journey_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
  public.current_staff_role() = 'library_incharge'
  and "journey_events"."verified_by_staff_id" = public.current_staff_id()
  and "journey_events"."biometric_confirmed" = true
);--> statement-breakpoint
CREATE POLICY "journey_events_select_reception" ON "journey_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.is_reception_for_library_pass("journey_events"."library_pass_id"));--> statement-breakpoint
CREATE POLICY "journey_events_select_library_incharge" ON "journey_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.current_staff_role() = 'library_incharge');
