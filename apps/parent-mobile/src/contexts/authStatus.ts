/**
 * Pure auth-status derivation logic (Prompt 3). Deliberately separated from
 * AuthContext.tsx's React/effect wiring so this — the actual decision
 * logic route protection depends on — can be unit-tested under plain
 * Vitest, with no React Native renderer needed (matching this repo's
 * Prompt-2-established testing convention: pure-logic modules only under
 * Vitest until a React-Native-aware test runner is chosen).
 */

export type AuthStatus =
  | "initializing"
  | "unauthenticated"
  | "authenticating"
  | "authenticated"
  | "device_verification_required"
  | "session_expired"
  | "offline"
  | "error";

export type DeviceCheckStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "trusted" }
  | { kind: "untrusted" }
  | { kind: "network_error" }
  | { kind: "error" };

export interface DeriveAuthStatusInput {
  /** True until the very first Supabase session lookup resolves. */
  sessionLoading: boolean;
  /** True if required Supabase env vars are missing — nothing about auth
   * can be determined at all. */
  configError: boolean;
  /** The current raw Supabase session, or null. */
  hasSession: boolean;
  /** True while an explicit requestOtp/verifyOtp call is in flight. */
  isAuthenticating: boolean;
  /** Result of the (device-trust) check performed once a session exists. */
  deviceCheck: DeviceCheckStatus;
  /** Set when a previously-present session became null WITHOUT the app
   * itself having just called signOut() — the best signal available from
   * supabase-js's event model for "this was an unexpected session loss"
   * (refresh failure, remote revocation) rather than an intentional logout.
   * This is an approximation, not a guarantee — supabase-js does not
   * currently expose a distinct "refresh failed" event separate from
   * SIGNED_OUT; documented as a known limitation (see
   * apps/parent-mobile/docs/authentication.md). */
  unexpectedSessionLoss: boolean;
}

/**
 * Derives the single canonical status route protection and any future
 * screen should read, from the raw signals above. Precedence matters —
 * ordered from "can't know anything yet" down to "know everything."
 */
export function deriveAuthStatus(input: DeriveAuthStatusInput): AuthStatus {
  if (input.configError) return "error";
  if (input.sessionLoading) return "initializing";
  if (input.isAuthenticating) return "authenticating";

  if (!input.hasSession) {
    return input.unexpectedSessionLoss ? "session_expired" : "unauthenticated";
  }

  switch (input.deviceCheck.kind) {
    case "idle":
    case "loading":
      return "initializing";
    case "trusted":
      return "authenticated";
    case "untrusted":
      return "device_verification_required";
    case "network_error":
      return "offline";
    case "error":
      return "error";
  }
}
