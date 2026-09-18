export type DevicePlatform = "android" | "ios";

export interface RegistrationChallenge {
  id: string;
  parentId: string;
  platform: DevicePlatform;
  nonce: string;
  expiresAt: Date;
}

export interface TrustedDeviceView {
  id: string;
  platform: DevicePlatform;
  registeredAt: string;
}

/** Every reason `registerDevice` can fail — deliberately distinguished
 * internally (for audit-log accuracy and unit-test precision) even though
 * the HTTP layer collapses several of these into one generic client-facing
 * message, the same anti-enumeration-adjacent posture `AuthOtpService`
 * already uses for its own failure modes. */
export type DeviceRegistrationFailureReason =
  | "challenge_not_found"
  | "challenge_expired"
  | "challenge_already_consumed"
  | "attestation_provider_not_configured"
  | "attestation_rejected"
  | "attestation_verification_error";

export interface DeviceRegistrationFailure {
  kind: "failure";
  reason: DeviceRegistrationFailureReason;
}

export interface DeviceRegistrationSuccess {
  kind: "success";
  device: TrustedDeviceView;
}

export type DeviceRegistrationResult = DeviceRegistrationFailure | DeviceRegistrationSuccess;
