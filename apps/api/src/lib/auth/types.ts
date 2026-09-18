// Shared types for the backend authentication/authorization boundary.
// See docs/auth-database-security-model.md for the full design this
// implements: Supabase Auth (identity/session) -> Fastify (authn + business
// authz) -> PostgreSQL/RLS (final boundary).

/** Claims this backend actually relies on from a verified Supabase JWT.
 * Deliberately narrow — per the Critical Rule (ADR-014, ADR-015,
 * docs/auth-database-security-model.md §13), relationship data and
 * business-authorization facts are NEVER read from the token; they are
 * always re-derived from PostgreSQL via profile.ts / guards.ts.
 *
 * `aal`/`amr` are the one deliberate exception to "never trust a token
 * claim for authorization": Authenticator Assurance Level is itself a
 * SESSION/IDENTITY fact Supabase Auth asserts and signs directly into the
 * JWT — not a business-authorization fact requiring a Postgres lookup —
 * exactly like `role` (the Postgres role claim) above. Confirmed present in
 * a real token, empirically, against a real local Supabase instance
 * (Prompt 3, RBAC & Authorization Framework — ADR-024's AAL2 requirement):
 * `aal: "aal1"` after password-only sign-in, `aal: "aal2"` +
 * `amr: [{method:"totp",...},{method:"password",...}]` after a real TOTP
 * enrollment+verification round-trip. Never assumed from documentation. */
export interface SupabaseJwtClaims {
  sub: string;
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  role: string; // Postgres role claim ("authenticated") — not an app role.
  email?: string;
  phone?: string;
  aal?: string; // "aal1" | "aal2" in practice — kept as `string` since Supabase's own SDK types it the same way (see AuthenticatorAssuranceLevels in @supabase/auth-js).
  amr?: Array<{ method: string; timestamp: number }>;
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
