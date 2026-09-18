import type { FastifyInstance } from "fastify";
import { StaffAdminService } from "../domain/staff/service.js";
import { DrizzleStaffRepository, type StaffRepository } from "../domain/staff/repository.js";
import {
  SupabaseStaffIdentityAdmin,
  type StaffIdentityAdminPort,
} from "../lib/auth/staffIdentityAdmin.js";

export interface RegisterStaffOverrides {
  /** Injectable for tests — bypasses the real Postgres connection AND the
   * real Supabase Admin API entirely. Production (app.ts, no override)
   * always uses DrizzleStaffRepository backed by
   * SupabaseStaffIdentityAdmin. */
  staffRepository?: StaffRepository;
  identityAdmin?: StaffIdentityAdminPort;
}

/**
 * Fails securely at registration time (matches `plugins/auth.ts`'s/
 * `plugins/otpAuth.ts`'s established "fail loudly at boot, not silently at
 * request time" discipline) if `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`
 * are not both configured — this is the FIRST consumer of a service-role
 * Supabase key anywhere in this backend (see `staffIdentityAdmin.ts`'s own
 * doc comment for why this genuinely new capability is justified).
 */
export function registerStaff(
  app: FastifyInstance<any, any, any, any, any>, // eslint-disable-line @typescript-eslint/no-explicit-any -- see plugins/emergency.ts
  overrides: RegisterStaffOverrides = {},
): void {
  // `identityAdmin` is only ever constructed when it will actually be used
  // (i.e. no `staffRepository` override bypassed `DrizzleStaffRepository`
  // entirely) — a test that injects a fake repository has no need for real
  // Supabase Admin API credentials, matching `otpAuthOverrides`'s identical
  // "override the thing you're testing around, not everything" convention
  // used throughout this codebase's other test-only plugin overrides.
  function resolveIdentityAdmin(): StaffIdentityAdminPort {
    if (overrides.identityAdmin) return overrides.identityAdmin;
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to register the Identity & Access Administration Center but were not both set",
      );
    }
    return new SupabaseStaffIdentityAdmin(supabaseUrl, serviceRoleKey);
  }

  const repository =
    overrides.staffRepository ?? new DrizzleStaffRepository(resolveIdentityAdmin());
  app.decorate("staffAdminService", new StaffAdminService(repository));
}
