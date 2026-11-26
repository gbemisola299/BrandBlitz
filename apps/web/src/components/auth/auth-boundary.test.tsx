import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthBoundary } from "./auth-boundary";

// Hoisted so the vi.mock factory can reference it.
const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({ captureException: sentry.captureException }));

let shouldThrow = false;

function Child() {
  if (shouldThrow) {
    throw new Error("session provider exploded");
  }
  return <p>Signed-in content</p>;
}

describe("AuthBoundary", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    shouldThrow = false;
    sentry.captureException.mockReset();
    // React logs caught render errors; silence them and assert on our own log line.
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("renders children normally when no error is thrown", () => {
    render(
      <AuthBoundary>
        <Child />
      </AuthBoundary>
    );

    expect(screen.getByText("Signed-in content")).toBeInTheDocument();
    expect(screen.queryByText("Sign-in is temporarily unavailable.")).not.toBeInTheDocument();
  });

  it("shows the fallback UI when a child throws", () => {
    shouldThrow = true;

    render(
      <AuthBoundary>
        <Child />
      </AuthBoundary>
    );

    expect(screen.getByText("Sign-in is temporarily unavailable.")).toBeInTheDocument();
    expect(screen.getByText(/Public pages still work/)).toBeInTheDocument();
    expect(screen.queryByText("Signed-in content")).not.toBeInTheDocument();
  });

  it("resets the error state and re-renders children when Try again is clicked", () => {
    shouldThrow = true;
    render(
      <AuthBoundary>
        <Child />
      </AuthBoundary>
    );

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("Signed-in content")).toBeInTheDocument();
    expect(screen.queryByText("Sign-in is temporarily unavailable.")).not.toBeInTheDocument();
  });

  it("logs the error to console.error and reports it to Sentry when it is installed", async () => {
    shouldThrow = true;

    render(
      <AuthBoundary>
        <Child />
      </AuthBoundary>
    );

    expect(consoleError).toHaveBeenCalledWith(
      "[AuthBoundary] session provider error:",
      expect.any(Error)
    );
    await waitFor(() => {
      expect(sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});
