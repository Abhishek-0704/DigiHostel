/**
 * Staff role type (Prompt 0.2 foundation — RBAC boundary only; real
 * role→permission mapping added in Prompt 3, `lib/authorization/policy.ts`).
 * Mirrors `staffRole` in packages/db/src/schema/enums.ts EXACTLY — the
 * schema/database is the authoritative source for which roles exist
 * (docs/reception-dashboard-architecture.md §5), not any generic role list.
 *
 * "Head Warden" is deliberately NOT included, re-confirmed in Prompt 3
 * (RBAC & Authorization Framework) after that prompt's own instructions
 * again asked this role to be "supported": no basis for it exists in the
 * schema, the SDD's Ch.7 §7.5 role table, `docs/product.md`'s canonical
 * seven-role list, or any RLS policy in `packages/db/src/schema/*.ts`
 * (re-verified this prompt, not merely carried forward unchecked). Adding
 * it here would silently fabricate a role the backend has no way to
 * authorize end-to-end — no RLS policy and no Fastify guard
 * (`apps/api/src/lib/auth/guards.ts`) would ever match it, so any frontend
 * "authorization" granted to it would be pure UI theater with nothing
 * behind it. Per this prompt's own §6 escape valve ("represent them
 * explicitly as pending rather than guessing"), this remains explicitly
 * REQUIRES DECISION — see docs/reception-dashboard-architecture.md §5/§35.
 * A future ADR that adds a real `staff_role` enum value, RLS policies, and
 * Fastify guard coverage is the only path to genuinely supporting it.
 *
 * `library_incharge` is included for type-completeness with the schema, but
 * the Reception Dashboard has no route or feature for it and
 * `lib/authorization/policy.ts` grants it zero permissions — ADR-001
 * assigns Library In-charge to a separate, also-not-yet-scaffolded Library
 * Dashboard (SDD Ch.8).
 */
export const STAFF_ROLES = [
  "reception_warden",
  "library_incharge",
  "hostel_admin",
  "super_admin",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

/** Roles this application actually serves (SDD Ch.7 §7.5; ADR-001). Used by
 * the RBAC route-guard foundation (src/routes/RequireRole.tsx) — a
 * successfully authenticated `library_incharge` session is recognized by
 * the type system but is not an intended user of this dashboard. */
export const RECEPTION_DASHBOARD_ROLES: readonly StaffRole[] = [
  "reception_warden",
  "hostel_admin",
  "super_admin",
];
