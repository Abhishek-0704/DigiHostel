// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PasswordInput } from "./PasswordInput";

afterEach(cleanup);

describe("PasswordInput", () => {
  it("is masked (type=password) by default", () => {
    render(<PasswordInput value="secret" onChange={() => {}} aria-label="Password" />);
    expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe("password");
  });

  it("toggling the show/hide control reveals and re-masks the value", () => {
    render(<PasswordInput value="secret" onChange={() => {}} aria-label="Password" />);
    const toggle = screen.getByRole("button", { name: "Show password" });

    fireEvent.click(toggle);
    expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe("text");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe("password");
  });

  it("the toggle is a real, keyboard-operable button with an accessible pressed state", () => {
    render(<PasswordInput value="secret" onChange={() => {}} aria-label="Password" />);
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle.getAttribute("type")).toBe("button");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide password" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("never mutates the value it's given", () => {
    const onChange = vi.fn();
    render(<PasswordInput value="secret" onChange={onChange} aria-label="Password" />);
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("secret");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disabling the input also disables the toggle", () => {
    render(<PasswordInput value="" onChange={() => {}} aria-label="Password" disabled />);
    expect((screen.getByLabelText("Password") as HTMLInputElement).disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Show password" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
