import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { Providers } from "./providers";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockToastError = vi.fn();

vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
  Toaster: () => null,
}));

vi.mock("next/dynamic", () => ({
  default:
    () =>
    ({ children }: { children: React.ReactNode }) =>
      children,
}));

function dispatchRejection(reason: unknown) {
  const event = new Event("unhandledrejection", { cancelable: true });
  Object.defineProperty(event, "reason", { value: reason });
  const preventDefault = vi.spyOn(event, "preventDefault");

  act(() => {
    window.dispatchEvent(event);
  });

  return { event, preventDefault };
}

describe("Providers unhandledrejection bridge (#791)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children while the global bridge is installed", () => {
    render(
      <Providers>
        <div>child content</div>
      </Providers>
    );

    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  it("prevents the default and toasts an Error reason's message", () => {
    render(<Providers>{null}</Providers>);

    const { preventDefault } = dispatchRejection(new Error("payment failed"));

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(mockToastError).toHaveBeenCalledTimes(1);
    expect(mockToastError).toHaveBeenCalledWith("payment failed");
  });

  it("passes a string rejection reason through unchanged", () => {
    render(<Providers>{null}</Providers>);

    dispatchRejection("offline");

    expect(mockToastError).toHaveBeenCalledWith("offline");
  });

  it("falls back to a generic message for non-Error, non-string reasons", () => {
    render(<Providers>{null}</Providers>);

    dispatchRejection({ code: 42 });

    expect(mockToastError).toHaveBeenCalledWith("An unexpected error occurred.");
  });

  it("removes the listener on unmount", () => {
    const { unmount } = render(<Providers>{null}</Providers>);

    unmount();
    const { event, preventDefault } = dispatchRejection(new Error("after unmount"));

    expect(preventDefault).not.toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
