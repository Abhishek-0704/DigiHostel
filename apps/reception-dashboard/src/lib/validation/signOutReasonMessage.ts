import type { SignOutReason } from "../../contexts/AuthContext";

/**
 * Pure copy mapping for the login screen's "why am I back here" notice
 * (Prompt 2 §16/§33) — reuses `AuthContext`'s existing `lastSignOutReason`
 * rather than inventing a second signal. Returns `undefined` for `null`
 * (nothing to say on a first, ordinary visit to /login).
 */
export function signOutReasonMessage(reason: SignOutReason): string | undefined {
  switch (reason) {
    case "session_invalid":
      return "Your session has expired. Please sign in again.";
    case "inactivity_timeout":
      return "You were signed out after a period of inactivity.";
    case "user_initiated":
      return "You have been signed out.";
    case null:
      return undefined;
  }
}
