import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { FingerprintProvider } from "./fingerprint-provider";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ENV_KEY = "NEXT_PUBLIC_FINGERPRINT_PUBLIC_KEY";
const originalKey = process.env[ENV_KEY];
const mockLoad = vi.fn();
let failImport = false;

vi.mock("@fingerprintjs/fingerprintjs-pro-react", () => ({
  get FingerprintJSPro() {
    if (failImport) throw new Error("import failed");
    return { load: (...args: unknown[]) => mockLoad(...args) };
  },
}));

function fingerprintWindow() {
  return window as typeof window & { fpPromise?: Promise<unknown> };
}

describe("FingerprintProvider (#792)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    delete process.env[ENV_KEY];
    delete fingerprintWindow().fpPromise;
    failImport = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalKey;
  });

  it("renders children immediately regardless of fingerprint initialization", async () => {
    render(
      <FingerprintProvider>
        <div>protected content</div>
      </FingerprintProvider>
    );
    expect(screen.getByText("protected content")).toBeInTheDocument();

    process.env[ENV_KEY] = "fp-key";
    mockLoad.mockResolvedValue({});
    render(
      <FingerprintProvider>
        <div>configured content</div>
      </FingerprintProvider>
    );
    expect(screen.getByText("configured content")).toBeInTheDocument();
    await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(1));
  });

  it("never attempts the dynamic import without a public key", async () => {
    render(
      <FingerprintProvider>
        <div>child</div>
      </FingerprintProvider>
    );
    await Promise.resolve();

    expect(mockLoad).not.toHaveBeenCalled();
    expect(fingerprintWindow().fpPromise).toBeUndefined();
  });

  it("assigns window.fpPromise from FingerprintJSPro.load when configured", async () => {
    process.env[ENV_KEY] = "fp-key";
    const agent = { get: vi.fn() };
    mockLoad.mockResolvedValue(agent);

    render(
      <FingerprintProvider>
        <div>child</div>
      </FingerprintProvider>
    );

    await waitFor(() => expect(mockLoad).toHaveBeenCalledWith({ apiKey: "fp-key" }));
    expect(fingerprintWindow().fpPromise).toBeInstanceOf(Promise);
    await expect(fingerprintWindow().fpPromise).resolves.toBe(agent);
  });

  it("warns without throwing when load() rejects", async () => {
    process.env[ENV_KEY] = "fp-key";
    const error = new Error("load failed");
    mockLoad.mockRejectedValue(error);

    expect(() =>
      render(
        <FingerprintProvider>
          <div>child</div>
        </FingerprintProvider>
      )
    ).not.toThrow();

    await waitFor(() =>
      expect(console.warn).toHaveBeenCalledWith("Failed to initialize FingerprintJS:", error)
    );
  });

  it("warns without throwing when the import fails", async () => {
    process.env[ENV_KEY] = "fp-key";
    failImport = true;

    expect(() =>
      render(
        <FingerprintProvider>
          <div>child</div>
        </FingerprintProvider>
      )
    ).not.toThrow();

    await waitFor(() => expect(console.warn).toHaveBeenCalled());
    expect(String((console.warn as ReturnType<typeof vi.fn>).mock.calls[0]?.[1])).toContain(
      "import failed"
    );
  });
});
