import { notFound } from "next/navigation";

/**
 * Debug page for the challenge-route error boundary (#820).
 * Throws during render, so the nearest error.tsx (challenge/[id]/error.tsx)
 * handles it. Mirrors /debug-error, which covers the root boundary.
 *
 * Not reachable in production.
 */
export default function ChallengeDebugErrorPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  throw new Error("Intentional challenge debug crash");
}
