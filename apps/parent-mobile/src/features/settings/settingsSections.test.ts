import { describe, expect, it } from "vitest";
import { SETTINGS_SECTIONS, searchSettingsSections } from "./settingsSections";

describe("SETTINGS_SECTIONS", () => {
  it("covers the seven recommended top-level sections", () => {
    const ids = SETTINGS_SECTIONS.map((s) => s.id);
    expect(ids).toEqual([
      "account",
      "notifications",
      "security",
      "privacy",
      "help",
      "about",
      "legal",
    ]);
  });

  it("every row has a non-empty title, description, route, and accessibility hint", () => {
    for (const section of SETTINGS_SECTIONS) {
      for (const row of section.rows) {
        expect(row.title.length).toBeGreaterThan(0);
        expect(row.description.length).toBeGreaterThan(0);
        expect(String(row.route).length).toBeGreaterThan(0);
        expect(row.accessibilityHint.length).toBeGreaterThan(0);
      }
    }
  });

  it("has no duplicate routes", () => {
    const routes = SETTINGS_SECTIONS.flatMap((s) => s.rows).map((r) => String(r.route));
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("only points at routes within the authenticated (app) group", () => {
    for (const row of SETTINGS_SECTIONS.flatMap((s) => s.rows)) {
      expect(String(row.route)).toMatch(/^\/\(app\)\//);
    }
  });
});

describe("searchSettingsSections", () => {
  it("returns every row for an empty query", () => {
    const all = SETTINGS_SECTIONS.flatMap((s) => s.rows);
    expect(searchSettingsSections(SETTINGS_SECTIONS, "")).toEqual(all);
  });

  it("matches by title case-insensitively", () => {
    const result = searchSettingsSections(SETTINGS_SECTIONS, "SECURITY");
    expect(result.map((r) => r.id)).toContain("security");
  });

  it("matches by description text", () => {
    const result = searchSettingsSections(SETTINGS_SECTIONS, "biometrics");
    expect(result.map((r) => r.id)).toContain("security");
  });

  it("returns an empty array when nothing matches", () => {
    expect(searchSettingsSections(SETTINGS_SECTIONS, "nonexistent-term-xyz")).toEqual([]);
  });
});
