import { useNavigate } from "react-router-dom";
import { ErrorState, Button } from "../ui";
import { ROUTES } from "../../constants/routes";
import styles from "./AccessDeniedMessage.module.css";

export interface AccessDeniedMessageProps {
  message?: string;
}

/**
 * Forbidden/access-denied UI (Prompt 3 §13/§14/§23/§27, given a recovery
 * action in Prompt 4 §19 — "provide recovery actions where safe... Return
 * to Dashboard"). Used by `RequireRole`/`RequirePermission` (route-level)
 * and available for inline use anywhere a `Can`-gated action needs an
 * explicit denial message instead of silently hiding.
 *
 * Distinct from `RequireAuth`'s redirect-to-`/login`: an authenticated,
 * MFA-verified staff member who simply lacks a role/permission is shown
 * THIS, in place, never redirected through the login flow (Prompt 3 §13's
 * explicit rule — "do not redirect an authenticated-but-forbidden staff
 * member through the login flow merely to hide an authorization
 * problem"). Reuses `ErrorState` (`role="alert"`, semantic, not
 * color-only) rather than inventing a second pattern — no new visual
 * language for "forbidden" vs. "error" was introduced.
 */
export function AccessDeniedMessage({
  message = "You don't have permission to access this.",
}: AccessDeniedMessageProps) {
  const navigate = useNavigate();

  return (
    <div className={styles.wrapper}>
      <ErrorState message={message} />
      <Button variant="secondary" onClick={() => void navigate(ROUTES.dashboard)}>
        Return to Dashboard
      </Button>
    </div>
  );
}
