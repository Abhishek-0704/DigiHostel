import { describe, it, expect } from "vitest";
import { BIOMETRIC_INFO_SECTIONS } from "./biometricContent";

describe("BIOMETRIC_INFO_SECTIONS", () => {
  it("has no empty title or body", () => {
    expect(BIOMETRIC_INFO_SECTIONS.length).toBeGreaterThan(0);
    for (const section of BIOMETRIC_INFO_SECTIONS) {
      expect(section.title.trim().length).toBeGreaterThan(0);
      expect(section.body.trim().length).toBeGreaterThan(0);
    }
  });

  it("never claims DigiHostel stores or verifies biometric data itself", () => {
    const allText = BIOMETRIC_INFO_SECTIONS.map((s) => `${s.title} ${s.body}`)
      .join(" ")
      .toLowerCase();
    expect(allText).not.toContain("digihostel verified");
    expect(allText).not.toContain("we store your fingerprint");
    expect(allText).not.toContain("we store your face");
    expect(allText).not.toContain("cryptographic");
    expect(allText).not.toContain("attestation");
  });
});
