import { describe, it, expect } from "vitest";
import { AuthOtpService } from "./service.js";
import { FakeEligibilityRepository } from "./__fixtures__/fake-eligibility-repository.js";
import { FakeOtpSender } from "./__fixtures__/fake-otp-sender.js";
import { InMemoryOtpChallengeStore } from "./otpChallengeStore.js";

const SESSION = { accessToken: "access-tok", refreshToken: "refresh-tok" };

function buildService() {
  const eligibility = new FakeEligibilityRepository();
  const sender = new FakeOtpSender();
  const store = new InMemoryOtpChallengeStore();
  const service = new AuthOtpService(eligibility, store, sender);
  return { eligibility, sender, store, service };
}

describe("AuthOtpService.requestOtp", () => {
  it("Test A — valid eligibility: dispatches OTP to the authoritative phone and returns a challenge id", async () => {
    const { eligibility, sender, service } = buildService();
    eligibility.addLink("ROLL-1", "father", "+911111111111");

    const result = await service.requestOtp("ROLL-1", "father");

    expect(result.challengeId).toBeTypeOf("string");
    expect(sender.sentTo).toEqual(["+911111111111"]);
  });

  it("Test B — invalid roll number: OTP is NOT dispatched, but a challenge id is still returned (constant shape)", async () => {
    const { sender, service } = buildService();

    const result = await service.requestOtp("NO-SUCH-ROLL", "father");

    expect(result.challengeId).toBeTypeOf("string");
    expect(sender.sentTo).toEqual([]);
  });

  it("Test C — wrong relationship: a real student with a DIFFERENT relationship linked does not dispatch an OTP", async () => {
    const { eligibility, sender, service } = buildService();
    eligibility.addLink("ROLL-2", "mother", "+922222222222"); // only mother is linked

    const result = await service.requestOtp("ROLL-2", "father"); // attacker asks for father

    expect(result.challengeId).toBeTypeOf("string");
    expect(sender.sentTo).toEqual([]);
  });

  it("Test D — arbitrary phone injection: the service accepts no phone input at all, so the authoritative phone can never be overridden", async () => {
    const { eligibility, sender, service } = buildService();
    eligibility.addLink("ROLL-3", "father", "+933333333333");

    // requestOtp's own signature has no phone parameter — this is a
    // type-level guarantee, not just a runtime one. Verified here by
    // confirming the ONLY phone ever dispatched to is the authoritative one.
    await service.requestOtp("ROLL-3", "father");

    expect(sender.sentTo).toEqual(["+933333333333"]);
  });

  it("Test F — unregistered parent (relationship record absent): OTP is NOT dispatched", async () => {
    const { eligibility, sender, service } = buildService();
    eligibility.addLink("ROLL-4", "father", "+944444444444");
    // No "guardian" relationship registered for ROLL-4 at all.

    await service.requestOtp("ROLL-4", "guardian");

    expect(sender.sentTo).toEqual([]);
  });

  it("Test I — enumeration resistance: eligible and ineligible requests return an identically-shaped response", async () => {
    const { eligibility, service } = buildService();
    eligibility.addLink("ROLL-5", "father", "+955555555555");

    const eligibleResult = await service.requestOtp("ROLL-5", "father");
    const ineligibleResult = await service.requestOtp("NONEXISTENT", "father");

    expect(Object.keys(eligibleResult)).toEqual(Object.keys(ineligibleResult));
    expect(eligibleResult.challengeId).not.toBe(ineligibleResult.challengeId);
  });

  it("a provider failure during dispatch does not throw — requestOtp still resolves with a challenge id", async () => {
    const { eligibility, sender, service } = buildService();
    eligibility.addLink("ROLL-6", "father", "+966666666666");
    sender.throwOnSend();

    await expect(service.requestOtp("ROLL-6", "father")).resolves.toHaveProperty("challengeId");
  });
});

describe("AuthOtpService.verifyOtp", () => {
  it("Test A (continued) — a correct code for an eligible challenge returns real session tokens", async () => {
    const { eligibility, sender, service } = buildService();
    eligibility.addLink("ROLL-7", "father", "+977777777777");
    sender.setCode("+977777777777", "123456", SESSION);
    const { challengeId } = await service.requestOtp("ROLL-7", "father");

    const result = await service.verifyOtp(challengeId, "123456");

    expect(result).toEqual(SESSION);
  });

  it("Test E — direct phone-only request has no equivalent here: verifyOtp has no phone parameter at all, only challengeId + code", async () => {
    // Structural test: confirms the method signature itself never accepts a
    // phone number, closing the "arbitrary phone" path at the type level,
    // not merely by convention.
    const { service } = buildService();
    expect(service.verifyOtp.length).toBe(2); // (challengeId, code) — no third phone param
  });

  it("Test F/G — an ineligible request's challenge can never succeed verification, regardless of code", async () => {
    const { service } = buildService();
    const { challengeId } = await service.requestOtp("NO-SUCH-ROLL", "father");

    const result = await service.verifyOtp(challengeId, "000000");

    expect(result).toBeNull();
  });

  it("an unknown challenge id fails the same way as an ineligible one", async () => {
    const { service } = buildService();

    const result = await service.verifyOtp("not-a-real-challenge-id", "123456");

    expect(result).toBeNull();
  });

  it("a wrong code for an otherwise-eligible challenge fails, without exhausting eligibility for a retry", async () => {
    const { eligibility, sender, service } = buildService();
    eligibility.addLink("ROLL-8", "father", "+988888888888");
    sender.setCode("+988888888888", "654321", SESSION);
    const { challengeId } = await service.requestOtp("ROLL-8", "father");

    const wrongAttempt = await service.verifyOtp(challengeId, "000000");
    const rightAttempt = await service.verifyOtp(challengeId, "654321");

    expect(wrongAttempt).toBeNull();
    expect(rightAttempt).toEqual(SESSION);
  });

  it("a challenge cannot be replayed after a successful verification", async () => {
    const { eligibility, sender, service } = buildService();
    eligibility.addLink("ROLL-9", "father", "+999999999999");
    sender.setCode("+999999999999", "111222", SESSION);
    const { challengeId } = await service.requestOtp("ROLL-9", "father");
    await service.verifyOtp(challengeId, "111222");

    const replay = await service.verifyOtp(challengeId, "111222");

    expect(replay).toBeNull();
  });

  it("a challenge is invalidated after exhausting its verify-attempt budget", async () => {
    const { eligibility, sender, service, store } = buildService();
    eligibility.addLink("ROLL-10", "father", "+910101010101");
    sender.setCode("+910101010101", "999999", SESSION);
    const { challengeId } = await service.requestOtp("ROLL-10", "father");
    void store; // present for readability of the fixture destructure only

    for (let i = 0; i < 5; i++) {
      await service.verifyOtp(challengeId, "wrong");
    }
    const finalAttempt = await service.verifyOtp(challengeId, "999999"); // even the real code now fails

    expect(finalAttempt).toBeNull();
  });
});
