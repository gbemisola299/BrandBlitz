"use client";

import * as React from "react";
import { useCountdown } from "@/hooks/use-countdown";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface CountdownTimerProps {
  durationSeconds: number;
  /**
   * Server-authoritative deadline as a Unix timestamp in milliseconds.
   * When provided the hook re-syncs against this value on tab-focus restore
   * instead of resuming stale client state (#346).
   */
  deadlineAt?: number;
  onExpire?: () => void;
  /** Called each second when countdown is ≤5 s for tick sound. */
  onTick?: () => void;
  className?: string;
  paused?: boolean;
  /** Called when the pause state changes (for parent to disable buttons) */
  onPausedChange?: (isPaused: boolean) => void;
}

export function CountdownTimer({
  durationSeconds,
  deadlineAt,
  onExpire,
  onTick,
  className,
  paused = false,
  onPausedChange,
}: CountdownTimerProps) {
  const { timeLeftMs, isPaused } = useCountdown({ durationSeconds, deadlineAt, onExpire, paused });

  const seconds = Math.ceil(timeLeftMs / 1000);
  const totalMs = Math.max(durationSeconds, 1) * 1000;
  const progress = (timeLeftMs / totalMs) * 100;
  const isLow = seconds <= 5;
  const prevSecondsRef = React.useRef(seconds);
  const prevPausedRef = React.useRef(isPaused);
  const hasMountedRef = React.useRef(false);
  const [announcement, setAnnouncement] = React.useState<string>("");

  React.useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    if (prevPausedRef.current !== isPaused) {
      prevPausedRef.current = isPaused;
      setAnnouncement(isPaused ? "Timer paused" : "Timer resumed");
    }
  }, [isPaused]);

  React.useEffect(() => {
    if (isLow && seconds < prevSecondsRef.current && onTick) {
      onTick();
    }
    if (!isPaused && seconds < prevSecondsRef.current) {
      if (seconds === 5) {
        setAnnouncement("5 seconds remaining");
      } else if (seconds <= 3 && seconds > 0) {
        setAnnouncement(`${seconds} ${seconds === 1 ? "second" : "seconds"} remaining`);
      } else if (seconds === 0) {
        setAnnouncement("Time expired");
      }
    }
    prevSecondsRef.current = seconds;
  }, [seconds, isLow, isPaused, onTick]);

  // Notify parent of pause state changes
  React.useEffect(() => {
    onPausedChange?.(isPaused);
  }, [isPaused, onPausedChange]);

  return (
    <div className={cn("flex flex-col items-center gap-2", className)} data-tutorial="timer">
      <span className="sr-only" aria-live="polite" role="status" aria-atomic="true">
        {announcement}
      </span>
      {isPaused ? (
        <span className="flex items-center gap-2 text-lg font-semibold text-amber-600">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          Paused
        </span>
      ) : (
        <span
          className={cn(
            "text-4xl font-bold tabular-nums transition-colors",
            isLow ? "animate-pulse text-red-500" : "text-[var(--foreground)]"
          )}
        >
          {seconds}
        </span>
      )}
      <Progress value={progress} className={cn("h-3 w-full", isLow && "[&>div]:bg-red-500")} />
    </div>
  );
}
