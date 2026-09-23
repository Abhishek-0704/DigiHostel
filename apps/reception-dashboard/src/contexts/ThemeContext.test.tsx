// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { ThemeProvider, useTheme } from "./ThemeContext";

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.reducedMotion;
  delete document.documentElement.dataset.highContrast;
  delete document.documentElement.dataset.fontScale;
});

describe("ThemeContext", () => {
  it("applies an explicit theme choice to <html data-theme> so tokens.css's [data-theme] rules can override the OS preference", () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    act(() => result.current.setThemePreference("dark"));
    expect(document.documentElement.dataset.theme).toBe("dark");
    act(() => result.current.setThemePreference("light"));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("applies reducedMotion/highContrast/fontScale as real data-* attributes, not just inert state", () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    act(() => {
      result.current.setReducedMotion(true);
      result.current.setHighContrast(true);
      result.current.setFontScale("larger");
    });
    expect(document.documentElement.dataset.reducedMotion).toBe("true");
    expect(document.documentElement.dataset.highContrast).toBe("true");
    expect(document.documentElement.dataset.fontScale).toBe("larger");
  });

  it("useTheme throws outside a ThemeProvider — fails loudly, never silently returns a default", () => {
    const originalError = console.error;
    console.error = () => {};
    expect(() => render(<ConsumerWithoutProvider />)).toThrow(
      "useTheme must be used within a ThemeProvider",
    );
    console.error = originalError;
  });
});

function ConsumerWithoutProvider() {
  useTheme();
  return null;
}
