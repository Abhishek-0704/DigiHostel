/**
 * ADR-003 implementation — the pure orchestration logic behind
 * `deviceService.registerCurrentDevice()` on Android, split out for the same
 * reason `contexts/authStatus.ts`/`navigation/routeGuard.ts` are split from
 * their own React/native-module-touching callers: this can be unit-tested
 * under plain Vitest with fakes for every dependency, while `devices.ts`
 * itself (which imports `expo-crypto`/`react-native` transitively via
 * `deviceIdentityService` and the native Play Integrity module) cannot be
 * parsed under a plain Node/Vitest run at all — see
 * `deviceServiceErrors.ts`'s own doc comment for this repo's established
 * reasoning on that split.
 *
 * Every dependency below is injected so a test can assert the exact
 * sequencing (challenge requested -> native call bound to that exact nonce
 * -> registration submitted with that exact token/fingerprint -> no local
 * trust ever declared on any failure) without a real network, a real native
 * module, or React Native at all.
 */

export interface DeviceChallenge {
  challengeId: string;
  nonce: string;
  expiresAt: string;
}

export interface RegisteredDevice {
  id: string;
  platform: "android" | "ios";
  registeredAt: string;
}

export interface RegisterDeviceOrchestrationDeps {
  requestChallenge: (platform: "android") => Promise<DeviceChallenge>;
  requestIntegrityToken: (nonce: string, cloudProjectNumber: string) => Promise<string>;
  submitRegistration: (input: {
    challengeId: string;
    platform: "android";
    attestationToken: string;
    deviceFingerprint: string;
  }) => Promise<RegisteredDevice>;
  getInstallationId: () => Promise<string>;
  getCloudProjectNumber: () => string | null;
}

export class DeviceAttestationNotConfiguredError extends Error {
  constructor() {
    super(
      "No Google Cloud project number is configured in this environment " +
        "(EXPO_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER) — device attestation cannot run.",
    );
    this.name = "DeviceAttestationNotConfiguredError";
  }
}

/**
 * Runs the full server-controlled Android registration flow. Throws (never
 * returns a fabricated success) on any failure at any step — a missing cloud
 * project number, a challenge-request failure, a native attestation failure,
 * or a registration-submission rejection all propagate as real errors to the
 * caller, exactly matching the "AUTHENTICATED != TRUSTED DEVICE, only a real
 * server-verified PASS may establish TRUSTED DEVICE" invariant.
 */
export async function orchestrateAndroidDeviceRegistration(
  deps: RegisterDeviceOrchestrationDeps,
): Promise<RegisteredDevice> {
  const cloudProjectNumber = deps.getCloudProjectNumber();
  if (!cloudProjectNumber) {
    throw new DeviceAttestationNotConfiguredError();
  }

  const deviceFingerprint = await deps.getInstallationId();
  const challenge = await deps.requestChallenge("android");
  const attestationToken = await deps.requestIntegrityToken(challenge.nonce, cloudProjectNumber);

  return deps.submitRegistration({
    challengeId: challenge.challengeId,
    platform: "android",
    attestationToken,
    deviceFingerprint,
  });
}
