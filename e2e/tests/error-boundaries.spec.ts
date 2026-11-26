import { test, expect } from "@playwright/test";

test.describe("Error Boundaries", () => {
  test("root error boundary catches generic render errors", async ({ page }) => {
    // Navigate to our intentional crash page
    // We expect this to be caught by apps/web/src/app/error.tsx
    await page.goto("/debug-error");

    // Check for the error boundary UI
    await expect(page.getByText("Something went wrong")).toBeVisible();
    await expect(page.getByText("Intentional debug crash")).not.toBeVisible(); // Should be obscured in production, but even in dev we show our UI

    const retryButton = page.getByRole("button", { name: /try again/i });
    await expect(retryButton).toBeVisible();
  });

  // #820: the challenge debug route throws inside /challenge/[id], so the
  // challenge-scoped error.tsx is the boundary under test. The id is unused by
  // the debug page, which throws before any challenge is loaded.
  const CHALLENGE_ID = "00000000-0000-4000-8000-000000000000";
  const CHALLENGE_ERROR_HEADING = "Challenge loading failed";

  test("challenge-route error boundary catches render errors inside /challenge/[id]", async ({
    page,
  }) => {
    await page.goto(`/challenge/${CHALLENGE_ID}/debug-error`);

    await expect(page.getByRole("heading", { name: CHALLENGE_ERROR_HEADING })).toBeVisible();
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  });

  test("navigating away from a challenge error and back recovers without a stuck error state", async ({
    page,
  }) => {
    await page.goto(`/challenge/${CHALLENGE_ID}/debug-error`);
    await expect(page.getByRole("heading", { name: CHALLENGE_ERROR_HEADING })).toBeVisible();

    await page.getByRole("link", { name: "Back to Challenges" }).click();
    await page.waitForURL((url) => url.pathname === "/");
    await expect(page.getByRole("heading", { name: CHALLENGE_ERROR_HEADING })).toHaveCount(0);

    // Returning to the route renders the boundary afresh, not a stale state.
    await page.goto(`/challenge/${CHALLENGE_ID}/debug-error`);
    await expect(page.getByRole("heading", { name: CHALLENGE_ERROR_HEADING })).toBeVisible();
  });
});
