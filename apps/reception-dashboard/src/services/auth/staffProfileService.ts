import { getSupabaseClient } from "../../lib/supabase/client";
import type { StaffRole } from "../../types/roles";

/**
 * Staff identity resolution (Prompt 3 §7/§19). Reads the caller's OWN
 * `staff` row directly via the Supabase client — RLS-protected
 * (`staff_select_own`: `auth_user_id = auth.uid()`, `packages/db/src/schema/identity.ts`),
 * so this can only ever return the signed-in user's own row, never anyone
 * else's, and the role/hostel values it returns are exactly what RLS
 * itself resolved server-side — not a client-supplied claim.
 *
 * The query is explicitly filtered by `auth_user_id` (not left to RLS
 * alone) — a real, previously-latent bug found live during Phase 5 Prompt
 * 13's own browser verification (the first time any prompt in this
 * session's history signed in as `super_admin`): `staff_all_super_admin`
 * (QG-01) is a second, broader SELECT policy that also matches for that
 * role, and Postgres OR's every applicable RLS policy together, so an
 * unfiltered select returned every staff row instead of one — which
 * `.maybeSingle()` then rejected with "multiple (or no) rows returned",
 * blocking every super_admin from ever completing sign-in. Filtering here
 * doesn't weaken RLS (a forged filter value still can't read another
 * user's row — RLS still applies on top), it just makes the query
 * deterministic regardless of which policy resolves the caller's access.
 *
 * This is the authoritative source this app uses for authorization UX
 * (§19: "Determine the authoritative source for staff role... Do not
 * duplicate authoritative authorization data unnecessarily") — no second
 * copy of role/hostel data is introduced. It is NOT the security boundary:
 * a forged/tampered client could return anything from this function and
 * every backend guard (`apps/api/src/lib/auth/guards.ts`) and every RLS
 * policy re-resolves role/hostel from Postgres independently, exactly as
 * before this prompt.
 *
 * Deliberately a direct table read, not a new Fastify endpoint: "who am I"
 * is an identity-resolution concern (the same class of operation
 * `authService.getSession()` already performs), not a business query —
 * and RLS already makes it safe. No business table is read anywhere in
 * this app.
 *
 * Returns `null` for a signed-in user who has no `staff` row at all (a
 * parent/student account, or a staff row that hasn't been provisioned
 * yet) — this is a real, expected, fail-closed state, not an error.
 */
export interface StaffProfile {
  id: string;
  fullName: string;
  role: StaffRole;
  hostelId: string | null;
}

export const staffProfileService = {
  async getMyStaffProfile(): Promise<StaffProfile | null> {
    const client = getSupabaseClient();
    const {
      data: { session },
    } = await client.auth.getSession();
    if (!session) return null;

    const { data, error } = await client
      .from("staff")
      .select("id, full_name, role, hostel_id")
      .eq("auth_user_id", session.user.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id as string,
      fullName: data.full_name as string,
      role: data.role as StaffRole,
      hostelId: (data.hostel_id as string | null) ?? null,
    };
  },
};
