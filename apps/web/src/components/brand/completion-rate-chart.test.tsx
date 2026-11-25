import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CompletionRateChart } from "./completion-rate-chart";

function progressCircle(container: HTMLElement): Element {
  // The first circle is the muted track; the second is the progress arc.
  const circles = container.querySelectorAll("circle");
  expect(circles).toHaveLength(2);
  return circles[1];
}

describe("CompletionRateChart", () => {
  it("renders skeleton placeholders instead of the chart while loading", () => {
    const { container } = render(
      <CompletionRateChart totalSessions={0} completedSessions={0} completionRate={0} loading />
    );

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(2);
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.queryByText("Completion Rate")).not.toBeInTheDocument();
  });

  it.each([0, 25, 50, 100])(
    "sets the progress arc strokeDasharray for a %i%% completion rate",
    (completionRate) => {
      const { container } = render(
        <CompletionRateChart
          totalSessions={10}
          completedSessions={5}
          completionRate={completionRate}
        />
      );

      expect(progressCircle(container)).toHaveAttribute(
        "stroke-dasharray",
        `${completionRate} ${100 - completionRate}`
      );
    }
  );

  it.each([0, 25, 50, 100])("shows the centred label %i%% exactly as the prop", (completionRate) => {
    render(
      <CompletionRateChart totalSessions={10} completedSessions={5} completionRate={completionRate} />
    );

    expect(screen.getByText(`${completionRate}%`)).toBeInTheDocument();
  });

  it("formats large session counts with toLocaleString", () => {
    const completed = 987_654;
    const total = 1_234_567;
    render(
      <CompletionRateChart totalSessions={total} completedSessions={completed} completionRate={80} />
    );

    expect(screen.getByText(completed.toLocaleString())).toBeInTheDocument();
    expect(screen.getByText(`of ${total.toLocaleString()} total sessions`)).toBeInTheDocument();
  });

  it("renders the boundary values 0% and 100% with empty and full arcs", () => {
    const { container, unmount } = render(
      <CompletionRateChart totalSessions={4} completedSessions={0} completionRate={0} />
    );
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(progressCircle(container)).toHaveAttribute("stroke-dasharray", "0 100");
    unmount();

    const full = render(
      <CompletionRateChart totalSessions={4} completedSessions={4} completionRate={100} />
    );
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(progressCircle(full.container)).toHaveAttribute("stroke-dasharray", "100 0");
  });
});
