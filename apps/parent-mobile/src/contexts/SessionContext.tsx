import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { authService } from "../services/supabase/auth";
import { MissingEnvVarError } from "../config/env";
import { logger } from "../services/logger/logger";

/**
 * Session-state foundation (Prompt 2). Exposes the current Supabase session
 * and its loading state — nothing else. No sign-in/OTP/registration logic
 * lives here (see src/services/supabase/auth.ts's doc comment); this is
 * purely "what is the current session, and has it changed."
 *
 * Deliberately tolerant of missing Supabase configuration: this foundation
 * ships without a configured .env by default (see env.example), and the
 * app must still boot and render its placeholder screens rather than crash
 * on the root layout. A misconfiguration surfaces as `configError`, not a
 * thrown render error — callers decide how/whether to surface that.
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
