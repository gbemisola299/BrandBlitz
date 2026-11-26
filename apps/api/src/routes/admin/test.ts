import { Router } from "express";
import { z } from "zod";
import { query } from "../../db";
import { authenticate } from "../../middleware/authenticate";
import { requireAdmin } from "../../middleware/require-admin";
import { updateChallengeStatus } from "../../db/queries/challenges";
import { processPayout } from "../../services/payout";
import { logger } from "../../lib/logger";

const router: Router = Router();

router.use(authenticate);
router.use(requireAdmin);

/**
 * POST /admin/test/promote-to-admin
 * Promotes a user to the admin role for e2e testing.
 */
router.post("/promote-to-admin", async (req, res) => {
  const { userId } = z.object({ userId: z.string().uuid() }).parse(req.body);
  await query("UPDATE users SET role = 'admin' WHERE id = $1", [userId]);
  res.json({ success: true });
});

/**
 * POST /admin/test/settle-challenge
 * Ends a challenge and processes its payout synchronously.
 * Payout rows are created before the Stellar attempt, so they persist
 * even if the Stellar network is unavailable in the test environment.
 */
router.post("/settle-challenge", async (req, res) => {
  const { challengeId } = z.object({ challengeId: z.string().uuid() }).parse(req.body);

  await updateChallengeStatus(challengeId, "ended");

  try {
    await processPayout(challengeId);
    res.json({ success: true, settled: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("Settle-challenge: payout processing failed (expected if no Stellar)", {
      challengeId,
      error: message,
    });
    res.json({ success: true, settled: false, error: message });
  }
});

/**
 * GET /admin/test/challenge-reports?challengeId=<uuid>
 * Returns the challenge_reports rows for a challenge, so e2e tests can check
 * that a submitted report was persisted with the right reason and details (#823).
 */
router.get("/challenge-reports", async (req, res) => {
  const { challengeId } = z
    .object({ challengeId: z.string().uuid() })
    .parse(req.query);
  const result = await query(
    `SELECT id, challenge_id, user_id, reason, details
       FROM challenge_reports
      WHERE challenge_id = $1`,
    [challengeId]
  );
  res.json({ reports: result.rows });
});

export default router;
