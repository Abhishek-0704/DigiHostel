import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Phase 5, Prompt 13 — Identity & Access Administration Center.
 *
 * Reconnaissance before this file was written confirmed NO Supabase Auth
 * Admin API client exists anywhere in this backend — `otpSender.ts` (the
 * only prior `createClient` call in `apps/api`) explicitly uses the anon
 * key, "no service-role key is introduced here or anywhere reachable from
 * the mobile app." This IS the first service-role-keyed Supabase client in
 * this codebase — a genuinely new capability, introduced deliberately and
 * narrowly for exactly the operations a staff-identity administrator
 * needs and that only the Admin API can perform (creating an `auth.users`
 * row without the user's own password, triggering a password-recovery
 * email). This is NOT a second identity system — ADR-014 already
 * established Supabase Auth as the canonical identity/session provider;
 * this is the standard, intended mechanism for admin-driven provisioning
 * under that same provider, reachable ONLY from this narrow port, used
 * ONLY by the staff domain, never exposed to the browser.
 *
 * Every method here deliberately avoids ever generating, storing, logging,
 * or returning a password:
 * - `inviteStaffUser` creates the `auth.users` row with NO password set at
 *   all and lets Supabase's own invite email carry a secure link for the
 *   new staff member to set their own initial password — this backend
 *   never sees or handles that password at any point.
 * - `sendPasswordResetEmail` triggers Supabase's own recovery-email flow
 *   identically.
 *
 * QG-04 remediation, F-QG04-02: this port previously also exposed
 * `forceSignOut(authUserId)`, calling `client.auth.admin.signOut(authUserId,
 * "global")`. That call was ALWAYS broken — the installed
 * @supabase/auth-js@2.113.0's `signOut(jwt, scope)` requires a SESSION
 * ACCESS-TOKEN JWT as its first argument (it is POSTed as a Bearer header
 * to `${url}/logout`), never a user id, and this backend never stores a
 * staff member's session JWT. Live-reproduced during the QG-04 review:
 * `AuthApiError: invalid JWT ... token contains an invalid number of
 * segments`, on every single invocation, for every staff member, always.
 * The installed Admin API's complete method surface (this file's own two
 * remaining methods, plus generateLink/createUser/listUsers/getUserById/
 * updateUserById/deleteUser) was exhaustively checked and confirmed to
 * have NO user-id-keyed "revoke every session" capability at all —
 * `updateUserById`'s `ban_duration` was evaluated and rejected too, since a
 * ban only blocks FUTURE Supabase Auth sign-ins and has no effect on an
 * already-issued, unexpired JWT against this backend's own stateless
 * JWT-verification path (`apps/api/src/lib/auth/jwt.ts` — JWKS signature
 * check only, never a round-trip to GoTrue's live user state). "Force
 * Sign-Out" is now a genuine, fully backend-owned mechanism instead —
 * `staff.sessions_invalidated_before` (see migration
 * `0023_fqg0402_force_sign_out_session_invalidation.sql` and
 * `domain/staff/repository.ts`'s `forceSignOut()`), enforced on every
 * authenticated request via `apps/api/src/lib/auth/db-port.ts`'s
 * `findStaffByAuthUserId`, comparing this column against the presented
 * JWT's own `iat` claim. This has nothing left to do with the Supabase
 * Admin API, so it was removed from this port entirely rather than kept as
 * a broken or dead method.
 */
export interface StaffIdentityAdminPort {
  /** Creates the `auth.users` row and sends Supabase's own invite email
   * (the new staff member sets their own initial password via a secure,
   * time-limited link). Throws on failure — the caller (repository) is
   * responsible for not having created a `staff` row yet at this point,
   * so there is nothing to compensate if this step itself fails. */
  inviteStaffUser(email: string): Promise<{ authUserId: string }>;
  /** Compensating action: deletes the `auth.users` row created by
   * `inviteStaffUser` if the subsequent `staff` row insert fails —
   * prevents an orphaned Supabase Auth identity with no corresponding
   * staff record. Failure here is logged, never thrown (the caller is
   * already in its own failure-handling path). */
  deleteAuthUser(authUserId: string): Promise<void>;
  /** Triggers Supabase's own password-recovery email for the given
   * address — never generates, stores, or returns a password itself. */
  sendPasswordResetEmail(email: string): Promise<void>;
}

export class SupabaseStaffIdentityAdmin implements StaffIdentityAdminPort {
  private readonly client: SupabaseClient;

  constructor(supabaseUrl: string, supabaseServiceRoleKey: string) {
    this.client = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async inviteStaffUser(email: string): Promise<{ authUserId: string }> {
    const { data, error } = await this.client.auth.admin.inviteUserByEmail(email);
    if (error || !data.user) {
      throw error ?? new Error("Supabase Admin API returned no user for inviteUserByEmail");
    }
    return { authUserId: data.user.id };
  }

  async deleteAuthUser(authUserId: string): Promise<void> {
    await this.client.auth.admin.deleteUser(authUserId);
  }

  async sendPasswordResetEmail(email: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email);
    if (error) {
      throw error;
    }
  }
}
