import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import NetInfo from "@react-native-community/netinfo";
import { deriveStatus, type NetworkStatus } from "./networkStatus";

/**
 * Network connectivity foundation (Prompt 2 — ADR-008's offline strategy;
 * made real in Prompt 9B for the leave-decision screen, the exact consumer
 * this file's own original doc comment named as the reason a real detector
 * would eventually be needed). Backed by `@react-native-community/netinfo`,
 * the standard Expo-compatible connectivity package — chosen here, not
 * earlier, because Prompt 9B is the first consumer that actually needs to
 * block a destructive mutation on real connectivity state; no other screen
 * in this app reads `status` yet.
 *
 * `status` starts `"unknown"` until NetInfo's first event fires (matching
 * the previous stub's contract exactly — no consumer-side change needed
 * elsewhere). The actual online/offline/unknown derivation lives in
 * `./networkStatus.ts` (a pure module with no React Native import) so it can
 * be unit-tested directly — see `networkStatus.ts`'s own doc comment.
 *
 * Never treat `status === "unknown"` as equivalent to "online" — consumers
 * that block an action while offline (the leave-decision screen) must treat
 * "unknown" the same as "offline", per ADR-008's server-authoritative,
 * never-silently-optimistic design for security-sensitive writes.
 */
export type { NetworkStatus };

interface NetworkContextValue {
  status: NetworkStatus;
}

const NetworkContext = createContext<NetworkContextValue>({ status: "unknown" });

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<NetworkStatus>("unknown");

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setStatus(deriveStatus(state));
    });
    return unsubscribe;
  }, []);

  return <NetworkContext.Provider value={{ status }}>{children}</NetworkContext.Provider>;
}

export function useNetworkContext(): NetworkContextValue {
  return useContext(NetworkContext);
}
