import { createContext, useContext, type ReactNode } from "react";

/**
 * Network connectivity foundation (Prompt 2 — ADR-008's offline strategy
 * depends on this existing eventually). Deliberately not backed by any
 * connectivity-detection package yet (e.g. @react-native-community/netinfo
 * or expo-network) — neither is named in this repository's accepted
 * dependency set, and picking one is a real decision this foundation pass
 * does not make. This provider exposes a stable, honestly-"unknown" status
 * so feature code can be written against the final shape now; swapping in
 * a real detector later is a one-file change here, not a consumer-side
 * rewrite.
 *
 * Never treat `status === "unknown"` as equivalent to "online" — consumers
 * that need to block an action while offline (e.g. a future leave-decision
 * screen) must treat "unknown" the same as "offline" until a real detector
 * exists, per ADR-008's server-authoritative, never-silently-optimistic
 * design for security-sensitive writes.
 */
export type NetworkStatus = "unknown" | "online" | "offline";

interface NetworkContextValue {
  status: NetworkStatus;
}

const NetworkContext = createContext<NetworkContextValue>({ status: "unknown" });

export function NetworkProvider({ children }: { children: ReactNode }) {
  // Fixed "unknown" value today, by design — see doc comment above.
  return (
    <NetworkContext.Provider value={{ status: "unknown" }}>{children}</NetworkContext.Provider>
  );
}

export function useNetworkContext(): NetworkContextValue {
  return useContext(NetworkContext);
}
