import { createClient } from "@supabase/supabase-js";

/**
 * Minimal, dedicated reachability probe for the Supabase Auth Admin API
 * (Phase 7, Prompt 18 — Diagnostics/Infrastructure Health). Deliberately a
 * SEPARATE, narrower port from `StaffIdentityAdminPort`
 * (`lib/auth/staffIdentityAdmin.ts`) rather than extending it: that port's
 * own doc comment scopes it tightly to "exactly the operations a staff-
 * identity administrator needs" (invite/delete/reset-password) — a
 * dependency-reachability check is a different concern (Monitoring, not
 * Identity Administration) and adding it there would blur that boundary for
 * no reuse benefit, since the two callers need different methods entirely.
 *
 * `ping()` performs the smallest real Admin API call available
 * (`listUsers` with `perPage: 1`) — it reads no sensitive data (this
 * backend already has unrestricted service-role Postgres access to `staff`;
 * this call's only purpose is proving the Admin API endpoint itself is
 * reachable and authenticating correctly) and never returns the response
 * body to any caller.
 */
export interface SupabaseAuthProbePort {
  ping(): Promise<void>;
}

export class SupabaseAuthProbe implements SupabaseAuthProbePort {
  private readonly client;

  constructor(supabaseUrl: string, supabaseServiceRoleKey: string) {
    this.client = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async ping(): Promise<void> {
    const { error } = await this.client.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) throw error;
  }
}
