import type { StaffRole } from "../../types/roles";
import type { Permission } from "./permissions";

/**
 * Centralized role → permission policy (Prompt 3 §10). A plain, static
 * lookup table — not a database-driven permission system. Per this
 * prompt's own §10 instruction ("do not introduce unnecessary database
 * complexity solely for theoretical flexibility") and §36 ("the smallest
 * production-grade, secure, extensible authorization foundation"), this
 * stays a static, isolated policy module specifically so it CAN evolve to
 * a dynamic/database-driven model later (Fastify could serve this same
 * `Permission[]` shape from a real endpoint without any caller of
 * `hasPermission`/`can` changing) without that evolution being forced now.
 *
 * INFERRED, not a precisely product-approved grant table: the only
 * authoritative source available is SDD Ch.7 §7.5's coarse role table
 * (Reception Warden: "Approve workflows, monitor queue"; Hostel Admin:
 * "Reports & configuration"; Super Admin: "Full access") plus this
 * prompt's own §1 responsibility-boundary description. Neither specifies
 * permission-by-permission grants. This mapping is a reasonable first pass
 * grounded in both, not a guess invented from nothing — but it should be
 * revisited once the product supplies an exact grant table (§6's own
 * escape valve: "represent them explicitly as pending rather than
 * guessing" — applied here at the mapping-precision level, not by refusing
 * to build the mechanism at all).
 *
 * `library_incharge` is intentionally granted nothing: it is not a
 * Reception Dashboard role at all (ADR-001; `types/roles.ts`'s own
 * `RECEPTION_DASHBOARD_ROLES` already excludes it) — Library In-charge has
 * its own, separately-planned Library Dashboard (SDD Ch.8).
 *
 * "Head Warden" (named in this prompt's §6) is NOT represented here at
 * all — see `types/roles.ts`'s doc comment for why: no such role exists in
 * `packages/db/src/schema/enums.ts`'s `staff_role` enum, so there is no
 * backend RLS/guard path that could ever authorize it end-to-end. Adding
 * it here would silently fabricate authorization the backend cannot
 * enforce. Represented as REQUIRES DECISION, not guessed.
 */
export const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  reception_warden: [
    "dashboard:view",
    "notifications:view",
    "leave:queue:view",
    "leave:manual_verification:decide",
    "leave:parent_approval:initiate",
    "leave:parent_approval:monitor",
    "student:search",
    "student:verify",
    "movement:exit",
    "movement:return",
    "emergency:manage",
    "health:manage",
    "audit:view",
  ],
  hostel_admin: [
    "dashboard:view",
    "notifications:view",
    "leave:queue:view",
    "leave:manual_verification:decide",
    "leave:parent_approval:initiate",
    "leave:parent_approval:monitor",
    "student:search",
    "student:verify",
    "movement:exit",
    "movement:return",
    "emergency:manage",
    "health:manage",
    "audit:view",
    "reports:view",
    "reports:generate",
    "configuration:manage",
  ],
  super_admin: [
    "dashboard:view",
    "notifications:view",
    "leave:queue:view",
    "leave:manual_verification:decide",
    "leave:parent_approval:initiate",
    "leave:parent_approval:monitor",
    "student:search",
    "student:verify",
    "movement:exit",
    "movement:return",
    "emergency:manage",
    "health:manage",
    "audit:view",
    "reports:view",
    "reports:generate",
    "users:manage",
    "configuration:manage",
    "system:view",
  ],
  library_incharge: [],
};

/**
 * A staff member's resolved authorization inputs — deliberately the
 * smallest shape every pure check below needs, so these functions stay
 * framework-agnostic and unit-testable without React or Supabase.
 */
export interface StaffAuthorization {
  role: StaffRole;
  hostelId: string | null;
}

export function permissionsForRole(role: StaffRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

/** Deterministic, fail-closed by construction: `staff` may be `null`
 * (authorization not yet loaded, or the caller has no staff profile at
 * all) — every check below returns `false` for `null`, never throws and
 * never defaults to permissive. */
export function hasRole(staff: StaffAuthorization | null, role: StaffRole): boolean {
  return staff?.role === role;
}

export function hasPermission(staff: StaffAuthorization | null, permission: Permission): boolean {
  if (!staff) return false;
  return ROLE_PERMISSIONS[staff.role].includes(permission);
}

/** Alias matching this prompt's §15/§18 requested API shape
 * (`can(...)`) — identical behavior to `hasPermission`, kept as a
 * separate export only because both names are explicitly requested and
 * some call sites read more naturally as `can(staff, "leave:queue:view")`
 * than `hasPermission(...)`. */
export const can = hasPermission;

export function hasAnyPermission(
  staff: StaffAuthorization | null,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((permission) => hasPermission(staff, permission));
}

export function hasAllPermissions(
  staff: StaffAuthorization | null,
  permissions: readonly Permission[],
): boolean {
  return permissions.every((permission) => hasPermission(staff, permission));
}

/**
 * Hostel/resource scope check (§11). `super_admin` is the only role not
 * hostel-scoped (matches every existing RLS policy's own shape —
 * `docs/rls-policy-matrix.md` — `super_admin`'s policies never join
 * against a hostel column). Every other role must have a non-null
 * `hostelId` that matches the target exactly — a staff member with a null
 * hostel assignment (a data anomaly for a non-super_admin role) is denied,
 * not treated as "unscoped" (fail closed).
 *
 * This is a UX-layer check only, exactly like every other function in this
 * file — it does not query the database and must never be treated as the
 * actual security boundary. The real boundary is RLS's own hostel-scoped
 * policies (unchanged, untouched by this work) and, for the one
 * Fastify-mediated staff route that exists today, the repository-layer
 * hostel check `apps/api/src/routes/leave.ts` already performs
 * server-side.
 */
export function canAccessHostel(
  staff: StaffAuthorization | null,
  targetHostelId: string | null,
): boolean {
  if (!staff) return false;
  if (staff.role === "super_admin") return true;
  if (!staff.hostelId || !targetHostelId) return false;
  return staff.hostelId === targetHostelId;
}
