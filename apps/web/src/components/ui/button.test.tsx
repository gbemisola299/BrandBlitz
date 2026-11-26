import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it.each([
    ["default", "bg-[var(--primary)]"],
    ["destructive", "bg-[var(--destructive)]"],
    ["outline", "border border-[var(--border)] bg-transparent"],
    ["secondary", "bg-[var(--secondary)]"],
    ["ghost", "hover:bg-[var(--accent)]"],
    ["link", "text-[var(--primary)]"],
  ])("renders %s variant with documented classes", (variant, expectedClass) => {
    render(<Button variant={variant} aria-label="Test button" />);
    const button = screen.getByRole("button", { name: /Test button/i });
    expect(button).toHaveClass(expectedClass);
  });

  it.each(["default", "sm", "lg", "icon"] as const)(
    "renders %s size with documented classes",
    (size) => {
      render(<Button size={size} aria-label="Test button" />);
      const button = screen.getByRole("button", { name: /Test button/i });
      if (size === "default") {
        expect(button).toHaveClass("h-10 px-4 py-2");
      }
      if (size === "sm") {
        expect(button).toHaveClass("h-8 rounded-md px-3 text-xs");
      }
      if (size === "lg") {
        expect(button).toHaveClass("h-12 rounded-md px-8 text-base");
      }
      if (size === "icon") {
        expect(button).toHaveClass("h-10 w-10");
      }
    }
  );

  it("renders child element's tag instead of button when asChild=true", () => {
    const { container } = render(
      <Button asChild>
        <span aria-label="Child span">Click me</span>
      </Button>
    );
    const childElement = container.querySelector("span");
    expect(childElement).toBeInTheDocument();
    expect(container.innerHTML).toContain("span");
  });

  it("forwards ref to the underlying DOM button element", () => {
    const ref = React.createRef<HTMLButtonElement>();

    render(<Button ref={ref} aria-label="Test button" />);

    expect(ref.current).toBe(screen.getByRole("button", { name: /Test button/i }));
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("applies disabled attribute and disabled utility classes", () => {
    render(<Button disabled aria-label="Disabled button" />);

    const button = screen.getByRole("button", { name: /Disabled button/i });
    expect(button).toBeDisabled();
    expect(button).toHaveClass("disabled:pointer-events-none");
    expect(button).toHaveClass("disabled:opacity-50");
    expect(button).toHaveAttribute("disabled");
  });
});
