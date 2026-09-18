import { useEffect, useState } from "react";

/**
 * Shared browser connectivity signal (extracted from `ConnectivityStatus`,
 * Prompt 4 §24/§25, when Prompt 5's `LiveStatusBar` needed the exact same
 * fact). One `online`/`offline` listener pair, not two independent ones —
 * Prompt 5 §14 explicitly forbids "a second independent connectivity
 * monitor" when Prompt 4 already established this signal. Both consumers
 * read `navigator.onLine` — the one connectivity fact actually available
 * without inventing a sync/session status this app has no mechanism to
 * compute (unchanged reasoning from `ConnectivityStatus`'s own doc comment).
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    function handleOnline() {
      setOnline(true);
    }
    function handleOffline() {
      setOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}
