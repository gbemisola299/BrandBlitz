import { afterEach, describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { BadgeGrid, deduplicateBadges, type Badge } from "./badge-grid";

const earned: Badge = {
  id: "1",
  slug: "first-win",
  name: "First Win",
  description: "Won first challenge",
  criteria: "Win a challenge",
  iconUrl: "/badges/first-win.png",
  earned: true,
  earnedAt: "2024-01-01",
};
const locked: Badge = {
  id: "2",
  slug: "streak-7",
  name: "7-Day Streak",
  description: "7 day streak",
  criteria: "Play 7 days in a row",
  iconUrl: "/badges/streak.png",
  earned: false,
};

describe("BadgeGrid", () => {
  it("renders earned badge without lock icon", () => {
    render(<BadgeGrid badges={[earned]} />);
    expect(screen.getByRole("img", { name: /First Win \(earned\)/i })).toBeTruthy();
  });

  it("renders locked badge with lock aria label", () => {
    render(<BadgeGrid badges={[locked]} />);
    expect(screen.getByRole("img", { name: /7-Day Streak \(locked\)/i })).toBeTruthy();
    expect(screen.getByText("Play 7 days in a row")).toBeTruthy();
  });

  it("calls onNewBadge for newly earned badges", () => {
    const cb = vi.fn();
    render(<BadgeGrid badges={[earned]} previouslyEarned={[]} onNewBadge={cb} />);
    expect(cb).toHaveBeenCalledWith(earned);
  });

  it("does not call onNewBadge for previously earned badges", () => {
    const cb = vi.fn();
    render(<BadgeGrid badges={[earned]} previouslyEarned={["1"]} onNewBadge={cb} />);
    expect(cb).not.toHaveBeenCalled();
  });

  it("renders nothing when badges array is empty", () => {
    const { container } = render(<BadgeGrid badges={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("BadgeGrid reduced-motion subscription (#842)", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  function mockReducedMotion(initial: boolean) {
    const listeners = new Set<(event: { matches: boolean }) => void>();
    const mediaQuery = {
      matches: initial,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: vi.fn((_type: string, listener: (event: { matches: boolean }) => void) => {
        listeners.add(listener);
      }),
      removeEventListener: vi.fn((_type: string, listener: (event: { matches: boolean }) => void) => {
        listeners.delete(listener);
      }),
    };
    window.matchMedia = vi.fn().mockReturnValue(mediaQuery) as unknown as typeof window.matchMedia;
    return {
      mediaQuery,
      listeners,
      emit(matches: boolean) {
        mediaQuery.matches = matches;
        listeners.forEach((listener) => listener({ matches }));
      },
    };
  }

  const iconWrapper = () => screen.getByAltText("First Win").parentElement as HTMLElement;

  it("bounces a newly earned badge when reduced motion is not preferred", () => {
    mockReducedMotion(false);
    render(<BadgeGrid badges={[earned]} previouslyEarned={[]} />);
    expect(iconWrapper().className).toContain("animate-bounce");
  });

  it("skips the bounce when reduced motion is preferred on mount", () => {
    mockReducedMotion(true);
    render(<BadgeGrid badges={[earned]} previouslyEarned={[]} />);
    expect(iconWrapper().className).not.toContain("animate-bounce");
  });

  it("updates the bounce when the preference changes while mounted", () => {
    const media = mockReducedMotion(false);
    render(<BadgeGrid badges={[earned]} previouslyEarned={[]} />);
    expect(iconWrapper().className).toContain("animate-bounce");

    act(() => media.emit(true));
    expect(iconWrapper().className).not.toContain("animate-bounce");

    act(() => media.emit(false));
    expect(iconWrapper().className).toContain("animate-bounce");
  });

  it("removes the change listener on unmount", () => {
    const media = mockReducedMotion(false);
    const { unmount } = render(<BadgeGrid badges={[earned]} previouslyEarned={[]} />);
    expect(media.listeners.size).toBe(1);

    unmount();
    expect(media.mediaQuery.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
    expect(media.listeners.size).toBe(0);
  });
});

describe("deduplicateBadges (#358)", () => {
  it("passes through a list with no duplicate slugs unchanged", () => {
    const result = deduplicateBadges([earned, locked]);
    expect(result).toHaveLength(2);
  });

  it("collapses two entries with the same slug to one", () => {
    const duplicate: Badge = { ...earned, id: "1b", earnedAt: "2024-02-01" };
    const result = deduplicateBadges([earned, duplicate]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("keeps the earliest-awarded entry when slugs collide", () => {
    const later: Badge = { ...earned, id: "1c", earnedAt: "2024-06-01" };
    const earlier: Badge = { ...earned, id: "1d", earnedAt: "2023-12-01" };
    const result = deduplicateBadges([later, earlier]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1d");
  });

  it("BadgeGrid renders each slug exactly once when duplicates are present", () => {
    const duplicate: Badge = { ...earned, id: "1e", earnedAt: "2024-03-01" };
    render(<BadgeGrid badges={[earned, duplicate, locked]} />);
    // Only one 'First Win' badge card should appear
    const firstWinCards = screen.getAllByText("First Win", { exact: true });
    expect(firstWinCards).toHaveLength(1);
  });
});
