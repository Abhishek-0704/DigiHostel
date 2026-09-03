import { describe, it, expect } from "vitest";
import { buildTheme, lightColors, darkColors } from "./tokens";

describe("buildTheme", () => {
  it("builds a light theme with the light color palette", () => {
    const theme = buildTheme("light");
    expect(theme.mode).toBe("light");
    expect(theme.colors).toEqual(lightColors);
  });

  it("builds a dark theme with the dark color palette", () => {
    const theme = buildTheme("dark");
    expect(theme.mode).toBe("dark");
    expect(theme.colors).toEqual(darkColors);
  });

  it("every color role defined for light is also defined for dark (no missing token)", () => {
    const lightKeys = Object.keys(lightColors).sort();
    const darkKeys = Object.keys(darkColors).sort();
    expect(darkKeys).toEqual(lightKeys);
  });

  it("exposes the same spacing/radii/iconSizes/motion/elevation tokens regardless of mode", () => {
    const light = buildTheme("light");
    const dark = buildTheme("dark");
    expect(light.spacing).toBe(dark.spacing);
    expect(light.radii).toBe(dark.radii);
    expect(light.iconSizes).toBe(dark.iconSizes);
    expect(light.motion).toBe(dark.motion);
  });
});
