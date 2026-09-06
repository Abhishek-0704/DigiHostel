/**
 * Pure connectivity-status derivation, extracted from `NetworkContext.tsx`
 * so it can be unit-tested without importing `@react-native-community/netinfo`
 * (which cannot be loaded under this workspace's plain-Node vitest
 * environment — see the root `vitest.config.ts`'s own comment on why no
 * `*.test.ts` file here imports React Native directly). Same rationale as
 * `leaveDecisionReconciliation.ts`'s "no React import" pure-module pattern.
 */
export type NetworkStatus = "unknown" | "online" | "offline";

/** Only the two fields this function reads — matches the shape of
 * `NetInfoState` from `@react-native-community/netinfo` structurally,
 * without importing that package's types here. */
export interface ConnectivitySignal {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}

/**
 * `status` becomes `"online"` only once both `isConnected` and
 * `isInternetReachable` are confirmed `true`. `isInternetReachable` reports
 * `null` while NetInfo is still probing reachability — treated the same as
 * the initial "not yet known" state, never optimistically `"online"`, per
 * ADR-008's server-authoritative design for security-sensitive writes (the
 * leave-decision screen blocks its mutation on anything other than
 * `"online"`).
 */
export function deriveStatus(state: ConnectivitySignal): NetworkStatus {
  if (state.isConnected === null) return "unknown";
  if (!state.isConnected) return "offline";
  if (state.isInternetReachable === false) return "offline";
  if (state.isInternetReachable === null) return "unknown";
  return "online";
}
