// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { CreateConfigurationDialog } from "./CreateConfigurationDialog";

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

function renderDialog(overrides: Partial<Parameters<typeof CreateConfigurationDialog>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onValidate = vi.fn().mockResolvedValue({ valid: true, kind: "valid", reason: null });
  const onClose = vi.fn();
  render(
    <CreateConfigurationDialog
      open
      onClose={onClose}
      domains={["system", "hostel"]}
      actingRole="super_admin"
      actingHostelId={null}
      onValidate={onValidate}
      onSubmit={onSubmit}
      submitting={false}
      errorMessage={null}
      {...overrides}
    />,
  );
  return { onSubmit, onValidate, onClose };
}

describe("CreateConfigurationDialog", () => {
  it("hostel_admin is forced into hostel scope — their own hostel id, never global", async () => {
    const { onSubmit } = renderDialog({ actingRole: "hostel_admin", actingHostelId: "hostel-a" });
    fireEvent.change(screen.getByLabelText("Key"), { target: { value: "warden_note" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Entry" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ scope: "hostel", hostelId: "hostel-a" }),
      ),
    );
    expect(screen.queryByLabelText("Scope")).toBeNull();
  });

  it("super_admin can choose Global scope, with hostelId null", async () => {
    const { onSubmit } = renderDialog();
    fireEvent.change(screen.getByLabelText("Key"), { target: { value: "banner_text" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Entry" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ scope: "global", hostelId: null }),
      ),
    );
  });

  it("switching value type to boolean renders a true/false select, not a text box", () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText("Value type"), { target: { value: "boolean" } });
    const valueControl = screen.getByLabelText("Value") as HTMLSelectElement;
    expect(valueControl.tagName).toBe("SELECT");
  });

  it("Validate calls the stateless preview endpoint and shows the result, without submitting", async () => {
    const { onValidate, onSubmit } = renderDialog();
    fireEvent.change(screen.getByLabelText("Key"), { target: { value: "some_key" } });
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    await waitFor(() => expect(onValidate).toHaveBeenCalled());
    expect(await screen.findByText("✓ Valid")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows an invalid validation result with its reason", async () => {
    const onValidate = vi
      .fn()
      .mockResolvedValue({ valid: false, kind: "invalid_value", reason: "Bad value." });
    renderDialog({ onValidate });
    fireEvent.change(screen.getByLabelText("Key"), { target: { value: "some_key" } });
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    expect(await screen.findByText("✕ Bad value.")).toBeTruthy();
  });

  it("requires a key before submitting", () => {
    const { onSubmit } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Create Entry" }));
    expect(screen.getByText("Key is required.")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the server's own error message when provided", () => {
    renderDialog({ errorMessage: "A configuration entry for this domain/key already exists." });
    expect(
      screen.getByText("A configuration entry for this domain/key already exists."),
    ).toBeTruthy();
  });
});
