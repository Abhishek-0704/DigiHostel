import { describe, it, expect } from "vitest";
import { DEVICE_REGISTRATION_SECTIONS, DEVICE_SECURITY_TIPS } from "./deviceContent";

describe("device education content", () => {
  it.each([
    ["DEVICE_REGISTRATION_SECTIONS", DEVICE_REGISTRATION_SECTIONS],
    ["DEVICE_SECURITY_TIPS", DEVICE_SECURITY_TIPS],
  ])("%s has no empty title or body", (_name, sections) => {
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      expect(section.title.trim().length).toBeGreaterThan(0);
      expect(section.body.trim().length).toBeGreaterThan(0);
    }
  });

  it("never mentions cryptographic attestation terminology the backend doesn't actually perform on this app's behalf", () => {
    const allText = [...DEVICE_REGISTRATION_SECTIONS, ...DEVICE_SECURITY_TIPS]
      .map((s) => `${s.title} ${s.body}`)
      .join(" ")
      .toLowerCase();
    expect(allText).not.toContain("cryptographic");
    expect(allText).not.toContain("attested");
    expect(allText).not.toContain("attestation");
  });
});
