import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionTimeoutConfig } from "../lib/sessionTimeout/config";
import {
  deriveInactivityStatus,
  type InactivityStatus,
} from "../lib/sessionTimeout/inactivityStatus";

/** Deliberately a small, low-frequency event set (Prompt 1 §16: "avoid
 * tracking every mouse movement excessively; use efficient browser
 * events") — discrete, per-interaction events, never `mousemove`/`scroll`.
 * `visibilitychange`-to-visible additionally counts as activity so
 * switching back to this tab after a while doesn't immediately show a stale
 * "expired" state before the user has done anything in it. */
const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart"] as const;
const CHECK_INTERVAL_MS = 1_000;

/**
 * Administrative inactivity tracking (Prompt 1 §16) — the mechanism half;
 * `lib/sessionTimeout/inactivityStatus.ts` is the pure decision logic this
 * wraps. Does NOT itself sign anyone out or render any UI — AuthContext
 * observes `status === "expired"` and calls `signOut("inactivity_timeout")`;
 * Prompt 2 owns the "you're about to be signed out" warning UI, reading
 * `status === "warning"` and `remainingMs` from here.
 *
 * `enabled: false` (e.g. not yet authenticated) tears down all listeners
 * and the interval — no tracking happens on the login page, and no timer
 * keeps a signed-out session's clock running for no reason.
 */
export function useInactivityTimer(
  config: SessionTimeoutConfig,
  enabled: boolean,
): { status: InactivityStatus; remainingMs: number; resetActivity: () => void } {
  const lastActivityRef = useRef(Date.now());
  const [status, setStatus] = useState<InactivityStatus>("active");
  const [remainingMs, setRemainingMs] = useState(config.idleTimeoutMs);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setStatus("active");
    setRemainingMs(config.idleTimeoutMs);
  }, [config.idleTimeoutMs]);

  useEffect(() => {
    if (!enabled) {
      setStatus("active");
      return;
    }

    resetActivity();

    const onActivity = () => {
      lastActivityRef.current = Date.now();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") onActivity();
    };

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    const interval = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      setStatus(deriveInactivityStatus(idleMs, config));
      setRemainingMs(Math.max(0, config.idleTimeoutMs - idleMs));
    }, CHECK_INTERVAL_MS);

    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, onActivity);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(interval);
    };
    // `config` is expected to be a stable, module-level constant
    // (SESSION_TIMEOUT_CONFIG) in practice, so this effect only genuinely
    // re-runs when `enabled` toggles.
  }, [enabled, config, resetActivity]);

  return { status, remainingMs, resetActivity };
}
