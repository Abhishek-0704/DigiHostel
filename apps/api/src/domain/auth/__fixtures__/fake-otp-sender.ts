import type { OtpSender } from "../otpSender.js";
import type { OtpVerificationResult } from "../types.js";

/** Deterministic in-memory fake — never calls a real Supabase/network
 * endpoint. Tracks every `send()` call (phone numbers actually dispatched
 * to) so tests can assert an ineligible request never reached this port at
 * all. `codesByPhone` maps a phone number to its "currently valid" OTP
 * code; `verify()` matches against it exactly once (single-use), mirroring
 * real OTP semantics closely enough for this layer's own unit tests
 * (concurrency/atomicity of the real Supabase-side verification is not
 * this fake's concern — that lives entirely inside Supabase itself, which
 * this backend never re-implements). */
export class FakeOtpSender implements OtpSender {
  sentTo: string[] = [];
  private codesByPhone = new Map<string, string>();
  private sessionsByPhone = new Map<string, OtpVerificationResult>();
  private shouldThrowOnSend = false;

  setCode(phoneNumber: string, code: string, session: OtpVerificationResult): this {
    this.codesByPhone.set(phoneNumber, code);
    this.sessionsByPhone.set(phoneNumber, session);
    return this;
  }

  throwOnSend(): this {
    this.shouldThrowOnSend = true;
    return this;
  }

  async send(phoneNumber: string): Promise<void> {
    this.sentTo.push(phoneNumber);
    if (this.shouldThrowOnSend) {
      throw new Error("simulated provider failure");
    }
  }

  async verify(phoneNumber: string, code: string): Promise<OtpVerificationResult | null> {
    const expected = this.codesByPhone.get(phoneNumber);
    if (!expected || expected !== code) {
      return null;
    }
    // Single-use, matching real OTP semantics.
    this.codesByPhone.delete(phoneNumber);
    return this.sessionsByPhone.get(phoneNumber) ?? null;
  }
}
