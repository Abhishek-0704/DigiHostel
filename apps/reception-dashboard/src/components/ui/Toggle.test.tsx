// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Toggle } from "./Toggle";

afterEach(cleanup);

describe("Toggle", () => {
  it("has a real associated label and correct switch semantics", () => {
    render(<Toggle id="t1" label="Reduce motion" checked={false} onChange={vi.fn()} />);
    const control = screen.getByLabelText("Reduce motion") as HTMLInputElement;
    expect(control.getAttribute("role")).toBe("switch");
    expect(control.getAttribute("aria-checked")).toBe("false");
  });

  it("calls onChange with the new value on click (keyboard-operable native checkbox)", () => {
    const onChange = vi.fn();
    render(<Toggle id="t2" label="High contrast" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("High contrast"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("a disabled toggle cannot be changed and shows its description", () => {
    const onChange = vi.fn();
    render(
      <Toggle
        id="t3"
        label="Emergency alerts"
        checked={true}
        disabled
        description="Mandatory — cannot be disabled"
        onChange={onChange}
      />,
    );
    const control = screen.getByLabelText("Emergency alerts") as HTMLInputElement;
    expect(control.disabled).toBe(true);
    expect(screen.getByText("Mandatory — cannot be disabled")).toBeTruthy();
    fireEvent.click(control);
    expect(onChange).not.toHaveBeenCalled();
  });
});
