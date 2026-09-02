import { describe, it, expect } from "vitest";
import { NEXT_ESCALATION_STAGE } from "./types.js";

describe("NEXT_ESCALATION_STAGE — escalation chain order (ADR-017, corrected by ADR-019 §1)", () => {
  it("matches the FR-007/ADR-019-literal chain exactly, including the in_app_call hop", () => {
    expect(NEXT_ESCALATION_STAGE).toEqual({
      pending: "father_notified",
      father_notified: "mother_notified",
      mother_notified: "guardian_notified",
      guardian_notified: "in_app_call",
      in_app_call: "manual_verification",
    });
  });

  it("manual_verification has no automatic successor — automation stops there (ADR-017 §9 / ADR-019 §2)", () => {
    expect(NEXT_ESCALATION_STAGE.manual_verification).toBeUndefined();
  });
});
