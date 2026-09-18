import { Navigate } from "react-router-dom";
import { useAuthContext } from "../contexts/AuthContext";
import { useAuthorization } from "../contexts/AuthorizationContext";
import { BrandHeader, AuthFooter, LoginForm, MfaVerification } from "../components/auth";
import { LoadingIndicator, ErrorState, Button } from "../components/ui";
import { ROUTES } from "../constants/routes";
import { signOutReasonMessage } from "../lib/validation/signOutReasonMessage";

/**
 * Login experience (Prompt 2 — Login Experience), rendered inside
 * `AuthenticationLayout`'s card at `/login`. One route handles every step of
 * ADR-024's chain (password → AAL1 → MFA → AAL2 → staff identity →
 * authorization), per `RequireAuth.tsx`'s own doc comment explaining why no
 * separate `/mfa-challenge` URL exists.
 *
 * The step shown is always DERIVED from `AuthContext`/`AuthorizationContext`
 * — the only two authorities for authentication/authorization state in this
 * app (§13/§26) — never a separately-tracked, potentially-desyncing local
 * "which step am I on" flag. This is also what makes session recovery
 * (§16) and the unauthorized-staff/authorization-failure states (§17) fall
 * out automatically: whatever `status`/`isAuthorized` already are when this
 * page mounts (e.g. a returning AAL2 session, or an AAL1-only one) renders
 * the correct step immediately, with no extra code path for "recovery" as
 * distinct from "fresh sign-in."
 *
 * Only one of the branches below ever renders at a time, so there is never
 * more than one loading indicator competing for attention (§18).
 */
export default function LoginPage() {
  const { status, lastSignOutReason, signOut } = useAuthContext();
  const { isAuthorizationLoading, isAuthorized, authorizationError, refreshAuthorization } =
    useAuthorization();

  if (status === "loading") {
    return (
      <>
        <BrandHeader />
        <LoadingIndicator label="Checking your session…" />
      </>
    );
  }

  if (status === "config_error") {
    return (
      <>
        <BrandHeader />
        <ErrorState message="This application isn't configured yet. Contact an administrator." />
      </>
    );
  }

  if (status === "unauthenticated") {
    return (
      <>
        <BrandHeader />
        <LoginForm notice={signOutReasonMessage(lastSignOutReason)} />
        <AuthFooter />
      </>
    );
  }

  if (status === "mfa_required") {
    return (
      <>
        <BrandHeader />
        <MfaVerification />
        <AuthFooter />
      </>
    );
  }

  // status === "authenticated": password + MFA/AAL2 verified. Authentication
  // success does not imply authorization (§17) — resolve the staff profile
  // before this route ever redirects to the dashboard.
  if (isAuthorizationLoading) {
    return (
      <>
        <BrandHeader />
        <LoadingIndicator label="Loading staff access…" />
      </>
    );
  }

  if (isAuthorized) {
    return <Navigate to={ROUTES.dashboard} replace />;
  }

  if (authorizationError?.kind === "unauthorized_staff") {
    // A valid, AAL2-verified Supabase identity with no `staff` row — never
    // auto-provisioned, never let through (§17/§37). This account is stuck
    // fully authenticated with nowhere protected to go, so this screen
    // (unlike the dashboard's Header) is the only place it can reach
    // AuthContext.signOut() to try a different account.
    return (
      <>
        <BrandHeader />
        <ErrorState message={authorizationError.userMessage} />
        <Button variant="secondary" onClick={() => void signOut()}>
          Back to sign in
        </Button>
        <AuthFooter />
      </>
    );
  }

  // Fail closed on every other case (the profile read itself failed —
  // `authorization_unavailable` — or any future authorization error kind
  // this branch doesn't specifically recognize): never treated as
  // authorized by omission, matching RequireAuth's own explicit allow-list
  // discipline.
  return (
    <>
      <BrandHeader />
      <ErrorState
        message={
          authorizationError?.userMessage ??
          "We couldn't determine what you're allowed to do. Please try again."
        }
        onRetry={() => void refreshAuthorization()}
      />
      <AuthFooter />
    </>
  );
}
