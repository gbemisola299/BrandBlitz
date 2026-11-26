import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { ThemeToggle } from "./theme-toggle";

function mockColorScheme(prefersDark: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches: prefersDark,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_type: string, listener: () => void) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_type: string, listener: () => void) => {
      listeners.delete(listener);
    }),
    dispatchEvent: vi.fn(),
  };
  window.matchMedia = vi
    .fn()
    .mockImplementation((query: string) =>
      query === "(prefers-color-scheme: dark)" ? media : { ...media, matches: false }
    ) as unknown as typeof window.matchMedia;

  return {
    media,
    change(next: boolean) {
      media.matches = next;
      listeners.forEach((listener) => listener());
    },
  };
}

function themeButton() {
  return screen.getByRole("button", { name: /^Theme:/ }) as HTMLButtonElement;
}

function expectDocumentTheme(mode: "light" | "dark" | "system", isDark: boolean) {
  expect(document.documentElement.dataset.theme).toBe(mode);
  expect(document.documentElement.classList.contains("dark")).toBe(isDark);
}

describe("ThemeToggle (#788)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    delete document.documentElement.dataset.theme;
    mockColorScheme(false);
  });

  it("renders a disabled System placeholder before the mount effect runs", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<ThemeToggle />);

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button).toHaveTextContent("System");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-hidden", "true");
    expect(button).not.toHaveAttribute("aria-label");
    expect(localStorage.getItem("theme")).toBeNull();
  });

  it("cycles system -> light -> dark -> system and persists every mode", () => {
    render(<ThemeToggle />);

    expect(themeButton()).toHaveTextContent("System");
    expect(localStorage.getItem("theme")).toBeNull();

    fireEvent.click(themeButton());
    expect(themeButton()).toHaveTextContent("Light");
    expect(localStorage.getItem("theme")).toBe("light");

    fireEvent.click(themeButton());
    expect(themeButton()).toHaveTextContent("Dark");
    expect(localStorage.getItem("theme")).toBe("dark");

    fireEvent.click(themeButton());
    expect(themeButton()).toHaveTextContent("System");
    expect(localStorage.getItem("theme")).toBe("system");
  });

  it("applies the dark class and dataset.theme for every mode", () => {
    render(<ThemeToggle />);
    expectDocumentTheme("system", false);

    fireEvent.click(themeButton());
    expectDocumentTheme("light", false);

    fireEvent.click(themeButton());
    expectDocumentTheme("dark", true);

    fireEvent.click(themeButton());
    expectDocumentTheme("system", false);
  });

  it("respects prefers-color-scheme while in system mode", () => {
    const colorScheme = mockColorScheme(true);
    render(<ThemeToggle />);
    expectDocumentTheme("system", true);

    fireEvent.click(themeButton());
    expectDocumentTheme("light", false);

    fireEvent.click(themeButton());
    expectDocumentTheme("dark", true);

    fireEvent.click(themeButton());
    expectDocumentTheme("system", true);

    act(() => colorScheme.change(false));
    expectDocumentTheme("system", false);
    expect(localStorage.getItem("theme")).toBe("system");
  });

  it("reads a stored dark theme as the initial mode on mount", () => {
    localStorage.setItem("theme", "dark");
    render(<ThemeToggle />);

    expect(themeButton()).toHaveTextContent("Dark");
    expect(themeButton()).toHaveAttribute("aria-label", "Theme: Dark. Switch to system.");
    expectDocumentTheme("dark", true);
  });

  it("keeps aria-label and aria-pressed in sync after each click", () => {
    render(<ThemeToggle />);

    expect(themeButton()).toHaveAttribute("aria-label", "Theme: System. Switch to light.");
    expect(themeButton()).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(themeButton());
    expect(themeButton()).toHaveAttribute("aria-label", "Theme: Light. Switch to dark.");
    expect(themeButton()).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(themeButton());
    expect(themeButton()).toHaveAttribute("aria-label", "Theme: Dark. Switch to system.");
    expect(themeButton()).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(themeButton());
    expect(themeButton()).toHaveAttribute("aria-label", "Theme: System. Switch to light.");
    expect(themeButton()).toHaveAttribute("aria-pressed", "false");
  });
});
