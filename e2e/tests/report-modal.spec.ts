import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  createApiToken,
  getChallengeReports,
  makeUserAdmin,
  seedActiveChallenge,
  signInWithMockGoogle,
} from "./helpers";
import { WARMUP_MIN_SECONDS } from "../../apps/web/src/components/game/constants";

// #823: full ReportModal submission against the real API, covering the success
// path, the client-side 60s rate limit, and the server-side 409 duplicate.

const API = process.env.E2E_API_BASE_URL ?? "http://localhost/api";

async function getUserId(request: APIRequestContext, token: string): Promise<string> {
  const response = await request.get(`${API}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as { user: { id: string } }).user.id;
}

async function createAdminToken(request: APIRequestContext): Promise<string> {
  const token = await createApiToken(request, {
    email: "report-admin@example.com",
    name: "Report Admin",
  });
  const adminId = await getUserId(request, token);
  await makeUserAdmin(request, adminId);
  return token;
}

/** Signs in through the UI and advances from the preview to Round 1 of the challenge. */
async function enterRound1(page: Page, user: { email: string; name: string }, challengeId: string) {
  await signInWithMockGoogle(page, user, `/challenge/${challengeId}`);
  await page.waitForURL(`**/challenge/${challengeId}`);

  await page.getByRole("button", { name: /start now/i }).click();
  await expect(page.getByText(/Study this brand carefully/i)).toBeVisible();

  const warmupStart = page.getByRole("button", { name: /Start Challenge/i });
  await expect(warmupStart).toBeEnabled({ timeout: (WARMUP_MIN_SECONDS + 5) * 1000 });
  await warmupStart.click();

  await expect(page.getByText("Round 1 of 3")).toBeVisible();
}

/** Opens the report dialog from the round screen. */
async function openReportDialog(page: Page) {
  await page.getByRole("button", { name: /report this challenge/i }).click();
  const dialog = page.getByRole("dialog", { name: "Report Challenge" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("brandblitz:keyboard-tooltip-dismissed", "1");
  });
});

test("submitting a report shows the success toast, closes the dialog, and persists the report", async ({
  page,
  request,
}) => {
  const adminToken = await createAdminToken(request);
  const seeded = await seedActiveChallenge(request, {
    email: "report-owner-success@example.com",
    name: "Report Owner Success",
  });
  const reporter = { email: "report-reporter-success@example.com", name: "Report Reporter" };
  await enterRound1(page, reporter, seeded.challengeId);

  const dialog = await openReportDialog(page);
  await dialog.getByText("Misleading content").click();
  await dialog.getByLabel("Additional details (optional)").fill("Caption is wrong");
  await dialog.getByRole("button", { name: "Submit Report" }).click();

  await expect(page.getByText(/Report submitted/i)).toBeVisible();
  await expect(dialog).toBeHidden();

  const reporterToken = await createApiToken(request, reporter);
  const reporterId = await getUserId(request, reporterToken);
  const reports = await getChallengeReports(request, adminToken, seeded.challengeId);
  expect(reports).toHaveLength(1);
  expect(reports[0]).toMatchObject({
    challenge_id: seeded.challengeId,
    user_id: reporterId,
    reason: "misleading_content",
    details: "Caption is wrong",
  });
});

test("a second submit within 60 seconds is blocked client-side with a wait warning", async ({
  page,
  request,
}) => {
  const adminToken = await createAdminToken(request);
  const seeded = await seedActiveChallenge(request, {
    email: "report-owner-rate@example.com",
    name: "Report Owner Rate",
  });
  await enterRound1(page, { email: "report-reporter-rate@example.com", name: "Rate Reporter" }, seeded.challengeId);

  const first = await openReportDialog(page);
  await first.getByText("Other").click();
  await first.getByRole("button", { name: "Submit Report" }).click();
  await expect(first).toBeHidden();

  const second = await openReportDialog(page);
  await second.getByText("Factually incorrect").click();
  await second.getByRole("button", { name: "Submit Report" }).click();

  await expect(page.getByText("Please wait before submitting another report.")).toBeVisible();
  await expect(second).toBeVisible();

  const reports = await getChallengeReports(request, adminToken, seeded.challengeId);
  expect(reports).toHaveLength(1);
});

test("submitting when the user already reported the challenge shows the 409 duplicate error", async ({
  page,
  request,
}) => {
  const seeded = await seedActiveChallenge(request, {
    email: "report-owner-dup@example.com",
    name: "Report Owner Dup",
  });
  const reporter = { email: "report-reporter-dup@example.com", name: "Dup Reporter" };

  // Report once through the API as the same user, so the UI submit hits the 409 path.
  const reporterToken = await createApiToken(request, reporter);
  const preReport = await request.post(`${API}/challenges/${seeded.challengeId}/report`, {
    headers: { Authorization: `Bearer ${reporterToken}` },
    data: { reason: "other" },
  });
  expect(preReport.ok()).toBeTruthy();

  await enterRound1(page, reporter, seeded.challengeId);
  const dialog = await openReportDialog(page);
  await dialog.getByText("Other").click();
  await dialog.getByRole("button", { name: "Submit Report" }).click();

  await expect(page.getByText("You have already reported this challenge.")).toBeVisible();
  await expect(dialog).toBeHidden();
});
