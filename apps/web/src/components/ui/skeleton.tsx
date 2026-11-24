import * as React from "react";
import { cn } from "@/lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional label announced to screen readers while this skeleton is visible.
   *  Defaults to "Loading…". Pass a more specific string when the context is known
   *  (e.g. "Loading leaderboard…") to satisfy issue #808. */
  loadingLabel?: string;
}

export function Skeleton({ className, loadingLabel = "Loading…", ...props }: SkeletonProps) {
  return (
    /*
     * Accessibility (issue #808): aria-busy="true" signals to AT that content is
     * still loading. The visually-hidden <span> with role="status" / aria-live="polite"
     * ensures screen readers announce the loading state without interrupting the user.
     * Visual shimmer rendering is unchanged.
     */
    <div
      aria-busy="true"
      className={cn("skeleton-shimmer rounded-md bg-[var(--muted)]", className)}
      {...props}
    >
      <span
        role="status"
        aria-live="polite"
        className="sr-only"
      >
        {loadingLabel}
      </span>
    </div>
  );
}

export function TableSkeleton({
  rows = 5,
  cols,
  loadingLabel = "Loading…",
}: {
  rows?: number;
  cols?: number;
  /** Optional label announced to screen readers while this table skeleton is visible. */
  loadingLabel?: string;
}) {
  return (
    /*
     * Accessibility (issue #808): aria-busy="true" on the wrapper tells AT the table
     * data is still loading. The sr-only status region announces the loading label once
     * on mount so keyboard/screen-reader users are not left with silent, unlabeled divs.
     */
    <div aria-busy="true">
      <span
        role="status"
        aria-live="polite"
        className="sr-only"
      >
        {loadingLabel}
      </span>
      <div className="grid grid-cols-[80px_1fr_120px_120px] gap-4 border-b border-[var(--border)] px-6 py-3">
        {Array.from({ length: cols ?? 4 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-16" loadingLabel="" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, idx) => (
        <div
          key={idx}
          className="grid grid-cols-[80px_1fr_120px_120px] items-center gap-4 border-b border-[var(--border)] px-6 py-3 last:border-0"
        >
          {Array.from({ length: cols ?? 4 }).map((_, ci) => (
            <Skeleton key={ci} className={cn("h-4", ci === 1 ? "w-36" : "ml-auto w-16")} loadingLabel="" />
          ))}
        </div>
      ))}
    </div>
  );
}
