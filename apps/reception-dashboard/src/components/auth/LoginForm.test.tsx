// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { LoginForm } from "./LoginForm";
import { authService } from "../../services/auth/authService";
import { AppError } from "../../lib/errors/errors";

vi.mock("../../services/auth/authService", () => ({
  authService: { signIn: vi.fn() },
}));

const mockSignIn = vi.mocked(authService.signIn);

afterEach(() => {
  cleanup();
  // `mockResolvedValue`/`mockRejectedValue` (used per-test below) replace
  // the mock's IMPLEMENTATION but not its accumulated call history — clear
  // that explicitly so each test's `toHaveBeenCalledTimes`/`toHaveBeenCalledWith`
  // assertions reflect only that test's own submissions.
  mockSignIn.mockClear();
});

function fillAndGetElements() {
  return {
    email: screen.getByLabelText("Email") as HTMLInputElement,
    password: screen.getByLabelText("Password") as HTMLInputElement,
    submit: screen.getByRole("button", { name: "Sign in" }),
  };
}

describe("LoginForm — rendering", () => {
  it("renders labeled email/password fields, a masked password, and a Sign in button", () => {
    render(<LoginForm />);
    const { email, password, submit } = fillAndGetElements();

    expect(email.type).toBe("email");
    expect(password.type).toBe("password");
    expect(submit.textContent).toBe("Sign in");
  });

  it("renders the passed-in notice above the fields", () => {
    render(<LoginForm notice="You have been signed out." />);
    expect(screen.getByText("You have been signed out.")).toBeTruthy();
  });
});

describe("LoginForm — validation", () => {
  it("focuses the email field on mount", () => {
    render(<LoginForm />);
    expect(document.activeElement).toBe(screen.getByLabelText("Email"));
  });

  it("rejects an empty email without calling authService", () => {
    render(<LoginForm />);
    const { password, submit } = fillAndGetElements();
    fireEvent.change(password, { target: { value: "correct-password" } });
    fireEvent.click(submit);

    expect(screen.getByText("Enter your email address.")).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("rejects an invalid email format", () => {
    render(<LoginForm />);
    const { email, password, submit } = fillAndGetElements();
    fireEvent.change(email, { target: { value: "not-an-email" } });
    fireEvent.change(password, { target: { value: "correct-password" } });
    fireEvent.click(submit);

    expect(screen.getByText("Enter a valid email address.")).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("rejects an empty password", () => {
    render(<LoginForm />);
    const { email, submit } = fillAndGetElements();
    fireEvent.change(email, { target: { value: "reception1@example.test" } });
    fireEvent.click(submit);

    expect(screen.getByText("Enter your password.")).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("trims the email before submitting but never trims the password", async () => {
    mockSignIn.mockResolvedValue({} as never);
    render(<LoginForm />);
    const { email, password, submit } = fillAndGetElements();
    fireEvent.change(email, { target: { value: "  reception1@example.test  " } });
    fireEvent.change(password, { target: { value: "  spaced pw  " } });
    fireEvent.click(submit);

    await waitFor(() => expect(mockSignIn).toHaveBeenCalled());
    expect(mockSignIn).toHaveBeenCalledWith("reception1@example.test", "  spaced pw  ");
  });
});

describe("LoginForm — submission", () => {
  it("submits valid credentials via authService.signIn", async () => {
    mockSignIn.mockResolvedValue({} as never);
    render(<LoginForm />);
    const { email, password, submit } = fillAndGetElements();
    fireEvent.change(email, { target: { value: "reception1@example.test" } });
    fireEvent.change(password, { target: { value: "correct-password" } });
    fireEvent.click(submit);

    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith("reception1@example.test", "correct-password"),
    );
  });

  it("prevents a duplicate submission while a request is already in flight", async () => {
    let resolveSignIn: () => void = () => {};
    mockSignIn.mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = () => resolve({} as never);
      }),
    );
    render(<LoginForm />);
    const { email, password, submit } = fillAndGetElements();
    fireEvent.change(email, { target: { value: "reception1@example.test" } });
    fireEvent.change(password, { target: { value: "correct-password" } });

    fireEvent.click(submit);
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(mockSignIn).toHaveBeenCalledTimes(1);
    resolveSignIn();
  });

  it("shows the sanitized message for invalid credentials, never a raw backend message", async () => {
    mockSignIn.mockRejectedValue(
      new AppError(
        "invalid_credentials",
        "That email or password isn't correct. Please try again.",
      ),
    );
    render(<LoginForm />);
    const { email, password, submit } = fillAndGetElements();
    fireEvent.change(email, { target: { value: "reception1@example.test" } });
    fireEvent.change(password, { target: { value: "wrong-password" } });
    fireEvent.click(submit);

    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toBe(
      "That email or password isn't correct. Please try again.",
    );
  });

  it("shows the sanitized network-failure message and recovers the form for retry", async () => {
    mockSignIn.mockRejectedValue(
      new AppError(
        "network",
        "You appear to be offline. Please check your connection and try again.",
      ),
    );
    render(<LoginForm />);
    const { email, password, submit } = fillAndGetElements();
    fireEvent.change(email, { target: { value: "reception1@example.test" } });
    fireEvent.change(password, { target: { value: "correct-password" } });
    fireEvent.click(submit);

    await screen.findByRole("alert");
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    expect(submit.textContent).toBe("Sign in");
  });

  it("clears the previous form-level error as soon as the user edits a field again", async () => {
    mockSignIn.mockRejectedValue(new AppError("invalid_credentials", "Wrong credentials."));
    render(<LoginForm />);
    const { email, password, submit } = fillAndGetElements();
    fireEvent.change(email, { target: { value: "reception1@example.test" } });
    fireEvent.change(password, { target: { value: "wrong-password" } });
    fireEvent.click(submit);
    await screen.findByRole("alert");

    fireEvent.change(password, { target: { value: "another-try" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
