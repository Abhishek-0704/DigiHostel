import { NativeModule, requireNativeModule } from "expo";

declare class DigihostelPlayIntegrityModule extends NativeModule<Record<string, never>> {
  /**
   * ADR-003 implementation — requests a genuine Google Play Integrity token
   * bound to `nonce` (the exact value returned by the backend's
   * POST /devices/challenge — see src/services/devices/devices.ts). Never
   * decodes or interprets the resulting token itself; it is relayed as-is to
   * POST /devices/register, where the real trust decision is made
   * server-side. Rejects (never resolves with a fabricated value) if Google
   * Play services is unavailable/out of date or the request otherwise fails.
   */
  requestIntegrityToken(nonce: string, cloudProjectNumber: string): Promise<string>;
}

// This call loads the native module object from the JSI. Android-only — see
// expo-module.config.json; there is no iOS/apple native backing for this
// module (App Attest is a separate, not-yet-implemented integration, see the
// ADR-003 implementation report).
export default requireNativeModule<DigihostelPlayIntegrityModule>("DigihostelPlayIntegrity");
