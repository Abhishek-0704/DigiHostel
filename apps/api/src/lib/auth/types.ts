// Shared types for the backend authentication/authorization boundary.
// See docs/auth-database-security-model.md for the full design this
// implements: Supabase Auth (identity/session) -> Fastify (authn + business
// authz) -> PostgreSQL/RLS (final boundary).

/** Claims this backend actually relies on from a verified Supabase JWT.
 * Deliberately narrow — per the Critical Rule (ADR-014, ADR-015,
 * docs/auth-database-security-model.md §13), relationship data and
 * business-authorization facts are NEVER read from the token; they are
 * always re-derived from PostgreSQL via profile.ts / guards.ts. */
export interface SupabaseJwtClaims {
  sub: string;
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  role: string; // Postgres role claim ("authenticated") — not an app role.
  email?: string;
  phone?: string;
}

export type StaffRole = "reception_warden" | "library_incharge" | "hostel_admin" | "super_admin";

export type AppProfile =
  | { kind: "student"; id: string; hostelId: string | null }
  | { kind: "parent"; id: string }
  | { kind: "staff"; id: string; role: StaffRole; hostelId: string | null }
  | { kind: "none" };

/** Populated on `request.auth` once authentication succeeds. */
export interface AuthContext {
  userId: string; // auth.users.id (JWT `sub`)
  claims: SupabaseJwtClaims;
  profile: AppProfile;
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}
