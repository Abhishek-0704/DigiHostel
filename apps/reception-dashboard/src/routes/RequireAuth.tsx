import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthContext } from "../contexts/AuthContext";
import { LoadingIndicator, ErrorState } from "../components/ui";
import { ROUTES } from "../constants/routes";

/**
 * Protected-route boundary (Prompt 0.2 §9/§13/§14/§27). Redirects to
 * /login whenever the session isn't BOTH password-authenticated AND
 * MFA-verified (`status !== "authenticated"`, per ADR-024 and
 * src/contexts/authStatus.ts) — `"mfa_required"` is treated exactly like
 * `"unauthenticated"` here: a password-only session is never sufficient to
 * reach a protected route (Prompt 0.2 §13's explicit security rule, "fail
 * closed").
 *
 * `/login` is the single redirect target for both states because no
 * separate MFA-challenge route/UI exists yet (Prompt 0.2 §4 forbids
 * building it now) — Prompt 2 (Login Experience) is expected to handle
 * password entry and the MFA challenge as steps within that one route, not
 * as two distinct URLs invented here without a real UX design behind them.
 *
 * This is a UX convenience ONLY — per §27's explicit instruction ("never
 * rely solely on... client-side route guards for authorization"), the real
 * authorization boundary is Fastify's guards + PostgreSQL RLS
 * (apps/api/src/lib/auth/guards.ts, docs/rls-policy-matrix.md). AAL2 is now
 * also enforced server-side for the one staff route that exists today
 * (`requireAal2()`, Prompt 3) — a client bypassing this component entirely
 * still cannot complete that action without a genuinely MFA-verified
 * session.
 *
 * EXPLICIT ALLOW-LIST (Prompt 3 §12, fixing a Prompt 0.3 ASRB MAJOR
 * finding): the previous version of this component redirected on the
 * known-bad statuses and fell through to `return children` for anything
 * else — logically equivalent at the time only because `AuthStatus`'s
 * union happened to be fully enumerated, but fragile: a newly introduced
 * status added later without updating this exact file would have silently
 * been authorized instead of denied. This version instead requires
 * `status === "authenticated"` explicitly and denies every other case by
 * default — a genuinely new status now fails closed automatically, with no
 * dependency on this file being remembered.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuthContext();

  if (status === "authenticated") {
    return children;
  }

  if (status === "loading") {
    return <LoadingIndicator label="Checking your session…" />;
  }

  if (status === "config_error") {
    return (
      <ErrorState message="This application isn't configured yet. Contact an administrator." />
    );
  }

  // Deny by default: "unauthenticated", "mfa_required", and any future
  // status this component doesn't yet know about all fall through to here.
  return <Navigate to={ROUTES.login} replace />;
}
