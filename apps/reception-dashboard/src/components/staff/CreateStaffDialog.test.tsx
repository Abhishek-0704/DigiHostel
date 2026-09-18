// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CreateStaffDialog } from "./CreateStaffDialog";

if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

afterEach(cleanup);

function renderDialog(overrides: Partial<Parameters<typeof CreateStaffDialog>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <CreateStaffDialog
      open
      onClose={onClose}
      onSubmit={onSubmit}
      submitting={false}
      errorMessage={null}
      {...overrides}
    />,
  );
  return { onSubmit, onClose };
}

describe("CreateStaffDialog", () => {
  it("never renders a password field anywhere on the form", () => {
    renderDialog();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it("requires a hostel id for reception_warden before submitting", () => {
    const { onSubmit } = renderDialog();
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Jane Staff" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jane@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    expect(screen.getByText("Reception Warden requires a hostel assignment.")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("allows library_incharge with no hostel id", async () => {
    const { onSubmit } = renderDialog();
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Lib Staff" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "lib@example.test" } });
    fireEvent.change(screen.getByLabelText(/^Role$/), { target: { value: "library_incharge" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    expect(onSubmit).toHaveBeenCalledWith({
      fullName: "Lib Staff",
      email: "lib@example.test",
      role: "library_incharge",
      hostelId: null,
    });
  });

  it("rejects a hostel id that is not a valid UUID", () => {
    const { onSubmit } = renderDialog();
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Jane Staff" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jane@example.test" } });
    fireEvent.change(screen.getByLabelText(/Hostel ID/), { target: { value: "not-a-uuid" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    expect(screen.getByText("Hostel ID must be a valid UUID.")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a valid reception_warden request with a real hostel UUID", () => {
    const { onSubmit } = renderDialog();
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Jane Staff" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jane@example.test" } });
    fireEvent.change(screen.getByLabelText(/Hostel ID/), {
      target: { value: "a0000000-0000-0000-0000-000000000001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    expect(onSubmit).toHaveBeenCalledWith({
      fullName: "Jane Staff",
      email: "jane@example.test",
      role: "reception_warden",
      hostelId: "a0000000-0000-0000-0000-000000000001",
    });
  });

  it("shows the server's own error message when provided", () => {
    renderDialog({ errorMessage: "A staff account with this email already exists." });
    expect(screen.getByText("A staff account with this email already exists.")).toBeTruthy();
  });
});
