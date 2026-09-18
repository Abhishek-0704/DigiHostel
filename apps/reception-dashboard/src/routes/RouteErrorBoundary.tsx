import { useEffect } from "react";
import { useNavigate, useRouteError, isRouteErrorResponse } from "react-router-dom";
import { ErrorState, Button } from "../components/ui";
import { ROUTES } from "../constants/routes";
import { logger } from "../lib/logging/logger";
import styles from "./RouteErrorBoundary.module.css";

/**
 * Route-level error recovery (Prompt 4 §19) — React Router's own
 * `errorElement` mechanism, distinct from `components/feedback/
 * ErrorBoundary.tsx` (a React error boundary wrapping the whole app in
 * `main.tsx`, unchanged). This one catches an error thrown while rendering
 * or loading a specific route (e.g. a future module's data loader
 * throwing) without tearing down the entire application shell — the
 * sidebar/header stay mounted, only the affected route's content is
 * replaced.
 *
 * Never renders the raw error's own message (`error.message`,
 * `error.stack`) — only logs it (matches `ErrorBoundary.tsx`'s identical
 * rule, `lib/errors/errors.ts`'s "never expose sensitive backend details").
 * Offers two independent recovery actions (§19: "Retry... Return to
 * Dashboard... Reload") rather than only a full-page reload.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  useEffect(() => {
    logger.error("Route-level error", {
      status: isRouteErrorResponse(error) ? error.status : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
  }, [error]);

  return (
    <div className={styles.wrapper}>
      <ErrorState
        message="Something went wrong loading this page. Please try again."
        onRetry={() => window.location.reload()}
      />
      <Button variant="secondary" onClick={() => void navigate(ROUTES.dashboard)}>
        Return to Dashboard
      </Button>
    </div>
  );
}
