import { describe, it, expect } from "vitest";
import { DeviceRegistrationService } from "./service.js";
import { FakeChallengeRepository } from "./__fixtures__/fake-challenge-repository.js";
import { FakeAttestationVerifier } from "./__fixtures__/fake-attestation-verifier.js";
import { FakeTrustedDeviceRepository } from "./__fixtures__/fake-trusted-device-repository.js";

function buildService() {
  const challengeRepository = new FakeChallengeRepository();
  const attestationVerifier = new FakeAttestationVerifier();
  const trustedDeviceRepository = new FakeTrustedDeviceRepository();
  const service = new DeviceRegistrationService(
    challengeRepository,
    attestationVerifier,
    trustedDeviceRepository,
  );
  return { challengeRepository, attestationVerifier, trustedDeviceRepository, service };
}

describe("DeviceRegistrationService.createChallenge", () => {
  it("returns a fresh challengeId/nonce/expiresAt for the calling parent", async () => {
    const { service } = buildService();

    const result = await service.createChallenge("parent-1", "android");

    expect(result.challengeId).toBeTypeOf("string");
    expect(result.nonce).toBeTypeOf("string");
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("issues a distinct nonce on every call, even for the same parent", async () => {
    const { service } = buildService();

    const a = await service.createChallenge("parent-1", "android");
    const b = await service.createChallenge("parent-1", "android");

    expect(a.nonce).not.toBe(b.nonce);
    expect(a.challengeId).not.toBe(b.challengeId);
  });
});

describe("DeviceRegistrationService.registerDevice", () => {
  it("valid attestation is accepted: trusted-device registration occurs only after verification", async () => {
    const { challengeRepository, attestationVerifier, trustedDeviceRepository, service } =
      buildService();
    attestationVerifier.setPass();
    const { challengeId } = await service.createChallenge("parent-1", "android");

    const result = await service.registerDevice({
      parentId: "parent-1",
      challengeId,
      platform: "android",
      attestationToken: "real-looking-token",
      deviceFingerprint: "device-fp-1",
    });

    expect(result.kind).toBe("success");
    expect(trustedDeviceRepository.created).toEqual([
      { parentId: "parent-1", deviceFingerprint: "device-fp-1" },
    ]);
    void challengeRepository;
  });

  it("the exact nonce issued for the challenge is what gets passed to the attestation verifier", async () => {
    const { attestationVerifier, service } = buildService();
    attestationVerifier.setPass();
    const { challengeId, nonce } = await service.createChallenge("parent-1", "android");

    await service.registerDevice({
      parentId: "parent-1",
      challengeId,
      platform: "android",
      attestationToken: "tok",
      deviceFingerprint: "fp",
    });

    expect(attestationVerifier.lastInput?.expectedNonce).toBe(nonce);
  });

  it("invalid attestation is rejected: device remains untrusted", async () => {
    const { attestationVerifier, trustedDeviceRepository, service } = buildService();
    attestationVerifier.setFail("device_integrity_not_met");
    const { challengeId } = await service.createChallenge("parent-1", "android");

    const result = await service.registerDevice({
      parentId: "parent-1",
      challengeId,
      platform: "android",
      attestationToken: "bad-token",
      deviceFingerprint: "fp",
    });

    expect(result).toEqual({ kind: "failure", reason: "attestation_rejected" });
    expect(trustedDeviceRepository.created).toEqual([]);
  });

  it("expired challenge is rejected: device remains untrusted", async () => {
    const { challengeRepository, trustedDeviceRepository, service } = buildService();
    const { challengeId } = await service.createChallenge("parent-1", "android");
    challengeRepository.expire(challengeId);

    const result = await service.registerDevice({
      parentId: "parent-1",
      challengeId,
      platform: "android",
      attestationToken: "tok",
      deviceFingerprint: "fp",
    });

    expect(result).toEqual({ kind: "failure", reason: "challenge_not_found" });
    expect(trustedDeviceRepository.created).toEqual([]);
  });

  it("a reused (already-consumed) challenge is rejected on the second attempt — no replay", async () => {
    const { attestationVerifier, trustedDeviceRepository, service } = buildService();
    attestationVerifier.setPass();
    const { challengeId } = await service.createChallenge("parent-1", "android");
    const first = await service.registerDevice({
      parentId: "parent-1",
      challengeId,
      platform: "android",
      attestationToken: "tok",
      deviceFingerprint: "fp-first",
    });

    const replay = await service.registerDevice({
      parentId: "parent-1",
      challengeId,
      platform: "android",
      attestationToken: "tok-captured-and-replayed",
      deviceFingerprint: "fp-attacker",
    });

    expect(first.kind).toBe("success");
    expect(replay).toEqual({ kind: "failure", reason: "challenge_not_found" });
    expect(trustedDeviceRepository.created).toEqual([
      { parentId: "parent-1", deviceFingerprint: "fp-first" },
    ]);
  });

  it("wrong-user redemption is rejected: a challenge issued to one parent cannot be redeemed by another", async () => {
    const { trustedDeviceRepository, service } = buildService();
    const { challengeId } = await service.createChallenge("parent-1", "android");

    const result = await service.registerDevice({
      parentId: "parent-2", // attacker — different parent than createChallenge was called for
      challengeId,
      platform: "android",
      attestationToken: "tok",
      deviceFingerprint: "fp",
    });

    expect(result).toEqual({ kind: "failure", reason: "challenge_not_found" });
    expect(trustedDeviceRepository.created).toEqual([]);
  });

  it("an unknown/malformed challengeId is rejected the same way as any other invalid challenge", async () => {
    const { trustedDeviceRepository, service } = buildService();

    const result = await service.registerDevice({
      parentId: "parent-1",
      challengeId: "00000000-0000-0000-0000-000000000000",
      platform: "android",
      attestationToken: "tok",
      deviceFingerprint: "fp",
    });

    expect(result).toEqual({ kind: "failure", reason: "challenge_not_found" });
    expect(trustedDeviceRepository.created).toEqual([]);
  });

  it("a platform mismatch between the challenge and the submission is rejected", async () => {
    const { trustedDeviceRepository, service } = buildService();
    const { challengeId } = await service.createChallenge("parent-1", "android");

    const result = await service.registerDevice({
      parentId: "parent-1",
      challengeId,
      platform: "ios", // challenge was issued for android
      attestationToken: "tok",
      deviceFingerprint: "fp",
    });

    expect(result).toEqual({ kind: "failure", reason: "attestation_rejected" });
    expect(trustedDeviceRepository.created).toEqual([]);
  });

  it("backend verification failure (attestation provider throws) fails closed — device remains untrusted, not treated as a pass", async () => {
    const { attestationVerifier, trustedDeviceRepository, service } = buildService();
    attestationVerifier.setThrows();
    const { challengeId } = await service.createChallenge("parent-1", "android");

    const result = await service.registerDevice({
      parentId: "parent-1",
      challengeId,
      platform: "android",
      attestationToken: "tok",
      deviceFingerprint: "fp",
    });

    expect(result).toEqual({ kind: "failure", reason: "attestation_verification_error" });
    expect(trustedDeviceRepository.created).toEqual([]);
  });

  it("an unconfigured attestation provider fails closed with a distinct, honest reason — never silently treated as a pass", async () => {
    const { attestationVerifier, trustedDeviceRepository, service } = buildService();
    attestationVerifier.setNotConfigured();
    const { challengeId } = await service.createChallenge("parent-1", "android");

    const result = await service.registerDevice({
      parentId: "parent-1",
      challengeId,
      platform: "android",
      attestationToken: "tok",
      deviceFingerprint: "fp",
    });

    expect(result).toEqual({ kind: "failure", reason: "attestation_provider_not_configured" });
    expect(trustedDeviceRepository.created).toEqual([]);
  });

  it("retrying registration with the SAME fingerprint after a dropped success response is idempotent (via a fresh challenge, not a replayed one)", async () => {
    const { attestationVerifier, trustedDeviceRepository, service } = buildService();
    attestationVerifier.setPass();
    const first = await service.createChallenge("parent-1", "android");
    await service.registerDevice({
      parentId: "parent-1",
      challengeId: first.challengeId,
      platform: "android",
      attestationToken: "tok-1",
      deviceFingerprint: "same-fp",
    });

    const second = await service.createChallenge("parent-1", "android");
    const result = await service.registerDevice({
      parentId: "parent-1",
      challengeId: second.challengeId,
      platform: "android",
      attestationToken: "tok-2",
      deviceFingerprint: "same-fp",
    });

    expect(result.kind).toBe("success");
    // The fake records every createTrustedDevice call — the real
    // DrizzleTrustedDeviceRepository's own idempotency (returning the
    // existing row instead of a duplicate) is covered by
    // trustedDeviceRepository.integration.test.ts against real Postgres.
    expect(trustedDeviceRepository.created.length).toBe(2);
  });
});
