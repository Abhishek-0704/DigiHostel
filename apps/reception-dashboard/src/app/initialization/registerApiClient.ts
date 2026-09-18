import { setApiBaseUrl } from "@digihostel/api-client-react";
import { getEnv } from "../../config/env";
import { registerAuthTokenProvider } from "../../services/api/authTokenProvider";
import { logger } from "../../lib/logging/logger";

/**
 * One-time API client bootstrap (Prompt 0.2). Called once from
 * src/main.tsx, before the app renders. Configures the shared
 * @digihostel/api-client-react package (base URL + auth token source) —
 * see packages/api-client-react/src/custom-fetch.ts's setApiBaseUrl, added
 * by this same scaffolding task specifically so a non-Expo consumer can
 * configure it (docs/adr/ADR-023).
 *
 * Tolerant of missing env config, matching src/config/env.ts's
 * fail-fast-at-point-of-use design: if VITE_API_BASE_URL isn't set yet (a
 * fresh clone before .env.local exists), the app still boots — every actual
 * API call will fail with a network error at the point it's made, not here.
 */
export function registerApiClient(): void {
  try {
    setApiBaseUrl(getEnv().apiBaseUrl);
  } catch (err) {
    logger.warn("API client base URL not configured — API calls will fail until set", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
  registerAuthTokenProvider();
}
