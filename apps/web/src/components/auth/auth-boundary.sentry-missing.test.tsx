import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthBoundary } from "./auth-boundary";

// Simulates an app that has not installed @sentry/nextjs: the dynamic import rejects.
vi.mock("@sentry/nextjs", () => {
  throw new Error("Cannot find package '@sentry/nextjs'");
});

function Broken(): never {
  throw new Error("session provider exploded");
}

describe("AuthBoundary without @sentry/nextjs", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("still shows the fallback and does not throw when the Sentry import fails", async () => {
    expect(() =>
      render(
        <AuthBoundary>
          <Broken />
        </AuthBoundary>
      )
    ).not.toThrow();

    expect(screen.getByText("Sign-in is temporarily unavailable.")).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith(
      "[AuthBoundary] session provider error:",
      expect.any(Error)
    );

    // Let the rejected import settle; componentDidCatch must swallow it silently.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const logged = consoleError.mock.calls.map(([msg]) => String(msg));
    expect(logged.some((msg) => msg.includes("Cannot find package"))).toBe(false);
  });
});
