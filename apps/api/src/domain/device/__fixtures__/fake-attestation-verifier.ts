import type {
  AttestationVerificationInput,
  AttestationVerificationResult,
  AttestationVerifier,
} from "../attestationVerifier.js";
import { AttestationProviderNotConfiguredError } from "../attestationVerifier.js";

/** Deterministic fake for DeviceRegistrationService unit tests — a real
 * Google Play Integrity call is never made from a unit test (see
 * attestationVerifier.test.ts for the real HTTP-call logic, tested there with
 * a mocked `fetch`, not here). */
export class FakeAttestationVerifier implements AttestationVerifier {
  public lastInput: AttestationVerificationInput | undefined;
  private mode: "pass" | "fail" | "not_configured" | "throw" = "pass";
  private rejectionReason = "device_integrity_not_met";

  setPass(): void {
    this.mode = "pass";
  }
  setFail(reason = "device_integrity_not_met"): void {
    this.mode = "fail";
    this.rejectionReason = reason;
  }
  setNotConfigured(): void {
    this.mode = "not_configured";
  }
  setThrows(): void {
    this.mode = "throw";
  }

  async verify(input: AttestationVerificationInput): Promise<AttestationVerificationResult> {
    this.lastInput = input;
    if (this.mode === "not_configured") {
      throw new AttestationProviderNotConfiguredError(input.platform);
    }
    if (this.mode === "throw") {
      throw new Error("simulated attestation verification transport error");
    }
    if (this.mode === "fail") {
      return { passed: false, provider: "play_integrity", rejectionReason: this.rejectionReason };
    }
    return { passed: true, provider: "play_integrity" };
  }
}
