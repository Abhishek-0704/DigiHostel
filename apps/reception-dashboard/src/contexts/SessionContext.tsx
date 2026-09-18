import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { authService } from "../services/auth/authService";
import { MissingEnvVarError } from "../config/env";
import { logger } from "../lib/logging/logger";

/**
 * Session-state foundation (Prompt 0.2). Exposes the current Supabase
 * session and its loading state — nothing else. No sign-in logic lives
 * here (see src/services/auth/authService.ts's doc comment on why). Mirrors
 * apps/parent-mobile/src/contexts/SessionContext.tsx.
 *
 * Deliberately tolerant of missing Supabase configuration: this foundation
 * ships without a configured .env.local by default, and the app must still
 * boot and render its placeholder pages rather than crash on the root
 * layout. A misconfiguration surfaces as `configError`, not a thrown render
 * error — callers decide how/whether to surface that.
 */
interface SessionContextValue {
  session: Session | null;
  isLoading: boolean;
  configError: boolean;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  isLoading: true,
  configError: false,
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [configError, setConfigError] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    authService
      .getSession()
      .then((current) => {
        setSession(current);
        unsubscribe = authService.onSessionChange(setSession);
      })
      .catch((err) => {
        if (err instanceof MissingEnvVarError) {
          setConfigError(true);
          logger.warn("Session unavailable — Supabase is not configured", {
            variable: err.variableName,
          });
        } else {
          logger.error("Failed to load session", { err });
        }
      })
      .finally(() => setIsLoading(false));

    return () => unsubscribe?.();
  }, []);

  return (
    <SessionContext.Provider value={{ session, isLoading, configError }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext(): SessionContextValue {
  return useContext(SessionContext);
}
