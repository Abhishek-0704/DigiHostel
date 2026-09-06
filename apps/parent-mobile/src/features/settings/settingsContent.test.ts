import { describe, expect, it } from "vitest";
import { PRIVACY_SECTIONS } from "./privacyContent";
import { FAQ_ENTRIES, SUPPORT_ACTIONS } from "./supportContent";
import { LEGAL_DOCUMENTS } from "./legalContent";

describe("PRIVACY_SECTIONS", () => {
  it("has unique ids and non-empty title/body for every section", () => {
    const ids = PRIVACY_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const section of PRIVACY_SECTIONS) {
      expect(section.title.length).toBeGreaterThan(0);
      expect(section.body.length).toBeGreaterThan(0);
    }
  });

  it("never mentions internal implementation details", () => {
    const joined = JSON.stringify(PRIVACY_SECTIONS).toLowerCase();
    expect(joined).not.toMatch(/row-level security|rls|postgres|supabase|jwt|service.role/);
  });
});

describe("FAQ_ENTRIES / SUPPORT_ACTIONS", () => {
  it("every FAQ entry has a question and answer", () => {
    for (const entry of FAQ_ENTRIES) {
      expect(entry.question.length).toBeGreaterThan(0);
      expect(entry.answer.length).toBeGreaterThan(0);
    }
  });

  it("every support action states what happens next", () => {
    for (const action of SUPPORT_ACTIONS) {
      expect(action.whatHappensNext.length).toBeGreaterThan(0);
    }
  });

  it("never claims a ticket/report was actually submitted", () => {
    const joined = JSON.stringify(SUPPORT_ACTIONS).toLowerCase();
    expect(joined).not.toMatch(/ticket (created|submitted)|your report has been (sent|submitted)/);
  });
});

describe("LEGAL_DOCUMENTS", () => {
  it("has the five expected documents, all explicitly marked as placeholders", () => {
    expect(LEGAL_DOCUMENTS.map((d) => d.id)).toEqual([
      "terms-of-service",
      "privacy-policy",
      "data-protection",
      "user-agreement",
      "open-source-licenses",
    ]);
    for (const doc of LEGAL_DOCUMENTS) {
      expect(doc.isPlaceholder).toBe(true);
      expect(doc.body.toLowerCase()).toMatch(/placeholder/);
    }
  });
});
