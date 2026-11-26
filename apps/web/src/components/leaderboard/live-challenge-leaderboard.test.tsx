import React from "react";
import { render, screen, within, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// If you use Jest instead of Vitest: delete the vitest import above
// and replace every `vi.` below with `jest.`

import { LiveChallengeLeaderboard } from "./live-challenge-leaderboard";

/* ------------------------------------------------------------------ */
/* CONFIG: check these against live-challenge-leaderboard.tsx          */
/* ------------------------------------------------------------------ */
const HIGHLIGHT_CLASS = "bg-yellow-100"; // <- the class added to rank-changed rows
const HIGHLIGHT_MS = 600;
const RENDER_PROPS = { challengeId: "challenge-1" }; // <- the component's props

// Path strings below must match the component's imports exactly.
// vi.mock paths are hoisted, so they have to be literals.
vi.mock("@/hooks/use-live-leaderboard", () => ({
  useLiveLeaderboard: vi.fn(),
}));
vi.mock("@/lib/format", () => ({
  formatScore: vi.fn((n: number) => `FMT(${n})`),
}));

import { useLiveLeaderboard } from "@/hooks/use-live-leaderboard";
import { formatScore } from "@/lib/format";

// Single place to change if the hook returns something other than { entries }.
function mockHook(entries: unknown[]) {
  (useLiveLeaderboard as any).mockReturnValue({ entries });
}

// Single place to change if your entry shape differs.
function makeEntry(rank: number, totalScore = rank * 1000) {
  return {
    userId: `user-${rank}`,
    displayName: `Player ${rank}`,
    rank,
    totalScore,
  };
}

const makeEntries = (n: number) =>
  Array.from({ length: n }, (_, i) => makeEntry(i + 1, (n - i) * 1500));

// Body rows only (skips the header row)
const getBodyRows = () => screen.getAllByRole("row").slice(1);

describe("LiveChallengeLeaderboard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    (formatScore as any).mockImplementation((n: number) => `FMT(${n})`);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("renders only the first 10 entries when more are supplied", () => {
    mockHook(makeEntries(15));
    render(<LiveChallengeLeaderboard {...RENDER_PROPS} />);

    expect(getBodyRows()).toHaveLength(10);
    expect(screen.getByText("Player 10")).toBeInTheDocument();
    expect(screen.queryByText("Player 11")).not.toBeInTheDocument();
    expect(screen.queryByText("Player 15")).not.toBeInTheDocument();
  });

  it("highlights a row whose rank changed and clears it after 600ms", () => {
    const a = makeEntry(1, 5000);
    const b = makeEntry(2, 4000);
    const c = makeEntry(3, 3000);

    mockHook([a, b, c]);
    const { rerender } = render(<LiveChallengeLeaderboard {...RENDER_PROPS} />);

    // First render: nothing has a "previous rank" yet, so nothing is highlighted
    getBodyRows().forEach((row) =>
      expect(row.className).not.toContain(HIGHLIGHT_CLASS)
    );

    // Swap player 2 and player 1
    mockHook([
      { ...b, rank: 1, totalScore: 6000 },
      { ...a, rank: 2, totalScore: 5000 },
      c, // unchanged
    ]);
    rerender(<LiveChallengeLeaderboard {...RENDER_PROPS} />);

    const rowOf = (name: string) =>
      screen.getByText(name).closest("tr") as HTMLElement;

    expect(rowOf("Player 2").className).toContain(HIGHLIGHT_CLASS);
    expect(rowOf("Player 1").className).toContain(HIGHLIGHT_CLASS);
    expect(rowOf("Player 3").className).not.toContain(HIGHLIGHT_CLASS);

    // Just before the timeout: still highlighted
    act(() => {
      vi.advanceTimersByTime(HIGHLIGHT_MS - 1);
    });
    expect(rowOf("Player 2").className).toContain(HIGHLIGHT_CLASS);

    // At 600ms: cleared
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(rowOf("Player 2").className).not.toContain(HIGHLIGHT_CLASS);
    expect(rowOf("Player 1").className).not.toContain(HIGHLIGHT_CLASS);
  });

  it("applies formatScore to totalScore for each row", () => {
    const entries = makeEntries(3);
    mockHook(entries);
    render(<LiveChallengeLeaderboard {...RENDER_PROPS} />);

    entries.forEach((entry) => {
      expect(formatScore).toHaveBeenCalledWith(entry.totalScore);
      const row = screen.getByText(entry.displayName).closest("tr") as HTMLElement;
      expect(within(row).getByText(`FMT(${entry.totalScore})`)).toBeInTheDocument();
    });
  });

  it("always renders an em dash in the Est. Payout column (known gap)", () => {
    // Entries deliberately carry payout-like data; the component ignores it today.
    const entries = makeEntries(3).map((e) => ({
      ...e,
      estimatedPayout: 25,
      payout: 25,
    }));
    mockHook(entries);
    render(<LiveChallengeLeaderboard {...RENDER_PROPS} />);

    const headers = screen.getAllByRole("columnheader");
    const payoutIdx = headers.findIndex((h) => /est\.?\s*payout/i.test(h.textContent ?? ""));
    expect(payoutIdx).toBeGreaterThanOrEqual(0);

    getBodyRows().forEach((row) => {
      const cells = within(row).getAllByRole("cell");
      expect(cells[payoutIdx]).toHaveTextContent("—");
    });
  });
});
