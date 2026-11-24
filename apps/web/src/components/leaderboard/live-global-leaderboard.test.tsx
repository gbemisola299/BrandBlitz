import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { LeaderboardEntry } from "@/lib/api";
import { LiveGlobalLeaderboard } from "./live-global-leaderboard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockGet = vi.fn();
const mockUseSession = vi.fn();
const mockUseInfiniteScroll = vi.fn((_options: unknown) => ({ current: null }));

vi.mock("@/lib/api", () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
  createApiClient: () => ({ get: (...args: unknown[]) => mockGet(...args) }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("@/hooks/use-infinite-scroll", () => ({
  useInfiniteScroll: (options: unknown) => mockUseInfiniteScroll(options),
}));

vi.mock("@/components/gamification/milestone-celebration", () => ({
  triggerMilestoneCelebration: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
}));

const STORAGE_KEY = "brandblitz:leaderboard:global:global:global";

function entry(username: string, rank: number): LeaderboardEntry {
  return {
    username,
    displayName: username.toUpperCase(),
    userId: username,
    rank,
    totalScore: 100 - rank,
    totalEarned: "1.5",
    avatarUrl: null,
    endedAt: null,
  };
}

function infiniteScrollOptions() {
  const call = mockUseInfiniteScroll.mock.lastCall as unknown as
    | [{ onLoadMore: () => void | Promise<void> }]
    | undefined;
  if (!call?.[0]) throw new Error("useInfiniteScroll was not called");
  return call[0];
}

async function triggerLoadMore() {
  await act(async () => {
    await infiniteScrollOptions().onLoadMore();
  });
}

describe("LiveGlobalLeaderboard (#790)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    mockGet.mockResolvedValue({ data: { data: [], nextCursor: null } });
    Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: 0 });
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    }) as unknown as typeof window.requestAnimationFrame;
  });

  it("appends the next page and advances nextCursor from the API response", async () => {
    mockGet
      .mockResolvedValueOnce({ data: { data: [entry("bola", 2)], nextCursor: "cursor-2" } })
      .mockResolvedValueOnce({ data: { data: [entry("chidi", 3)], nextCursor: null } });

    render(<LiveGlobalLeaderboard initial={[entry("ada", 1)]} initialHasMore />);
    expect(screen.getByText("Showing 1 players")).toBeInTheDocument();

    await triggerLoadMore();
    expect(mockGet).toHaveBeenNthCalledWith(1, "/leaderboard/global?limit=50&scope=global");
    expect(screen.getByText("BOLA")).toBeInTheDocument();
    expect(screen.getByText("Showing 2 players")).toBeInTheDocument();

    await triggerLoadMore();
    expect(mockGet).toHaveBeenNthCalledWith(
      2,
      "/leaderboard/global?limit=50&cursor=cursor-2&scope=global"
    );
    expect(screen.getByText("CHIDI")).toBeInTheDocument();
    expect(screen.getByText("Showing 3 players")).toBeInTheDocument();
    expect(screen.getByText("You've seen everything")).toBeInTheDocument();
  });

  it("renders the empty state when there are no rows", () => {
    render(<LiveGlobalLeaderboard initial={[]} />);

    expect(screen.getByText("No games played yet")).toBeInTheDocument();
    expect(screen.getByText("Be the first to climb the leaderboard.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse Challenges" })).toHaveAttribute(
      "href",
      "/challenge"
    );
  });

  it("renders the friends empty state for the friends scope", () => {
    render(<LiveGlobalLeaderboard initial={[]} scope="friends" />);

    expect(screen.getByText("No friends on the leaderboard yet")).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("restores scroll position by fetching pages until loadedCount is reached", async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ scrollY: 321, loadedCount: 3 }));
    mockGet
      .mockResolvedValueOnce({ data: { data: [entry("bola", 2)], nextCursor: "cursor-2" } })
      .mockResolvedValueOnce({ data: { data: [entry("chidi", 3)], nextCursor: null } });

    render(<LiveGlobalLeaderboard initial={[entry("ada", 1)]} initialHasMore />);

    await waitFor(() => expect(screen.getByText("Showing 3 players")).toBeInTheDocument());
    expect(mockGet).toHaveBeenNthCalledWith(1, "/leaderboard/global?limit=50&scope=global");
    expect(mockGet).toHaveBeenNthCalledWith(
      2,
      "/leaderboard/global?limit=50&cursor=cursor-2&scope=global"
    );
    expect(window.scrollTo).toHaveBeenCalledWith(0, 321);
    expect(screen.queryByText(/Restoring your place/)).not.toBeInTheDocument();
  });

  it("persists scrollY and the loaded entry count on pagehide and beforeunload", () => {
    Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: 456 });
    render(<LiveGlobalLeaderboard initial={[entry("ada", 1), entry("bola", 2)]} />);

    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null")).toEqual({
      scrollY: 456,
      loadedCount: 2,
    });

    sessionStorage.removeItem(STORAGE_KEY);
    act(() => {
      window.dispatchEvent(new Event("beforeunload"));
    });
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null")).toEqual({
      scrollY: 456,
      loadedCount: 2,
    });
  });

  it("shows the spinner while loadMore is in flight and hides it after resolving", async () => {
    let resolvePage!: (value: unknown) => void;
    mockGet.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePage = resolve;
        })
    );

    render(<LiveGlobalLeaderboard initial={[entry("ada", 1)]} initialHasMore />);
    await act(async () => {
      void infiniteScrollOptions().onLoadMore();
    });

    await waitFor(() => expect(document.querySelector(".animate-spin")).toBeInTheDocument());
    expect(screen.getByText("Showing 1 players")).toBeInTheDocument();

    await act(async () => {
      resolvePage({ data: { data: [entry("bola", 2)], nextCursor: null } });
    });
    await waitFor(() => expect(document.querySelector(".animate-spin")).not.toBeInTheDocument());
    expect(screen.getByText("Showing 2 players")).toBeInTheDocument();
  });
});
