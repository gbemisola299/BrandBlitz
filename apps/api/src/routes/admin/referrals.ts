import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { requireAdmin } from "../../middleware/require-admin";
import { createError } from "../../middleware/error";
import { findUserById, findUserByReferralCode } from "../../db/queries/users";
import {
  createReferral,
  findReferralByReferrerAndReferred,
  findReferralByReferredId,
} from "../../db/queries/referrals";
import { query } from "../../db/index";
import { logger } from "../../lib/logger";

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

const ManualReferralBodySchema = z
  .object({
    referredUserId: z.string().uuid("Invalid referred user ID"),
    referralCode: z.string().min(1, "Referral code is required").max(10),
    reason: z.string().min(1, "Override reason is required").max(500),
  })
  .strict();

/**
 * POST /admin/referrals/manual-attribution
 * Manually attribute a referral to a user who was blocked by the fingerprint-collision guard.
 * Records the override in audit_log for compliance tracking.
 * Closes #774
 */
router.post("/manual-attribution", async (req, res) => {
  const { referredUserId, referralCode, reason } = ManualReferralBodySchema.parse(req.body);

  const target = await findUserById(referredUserId);
  if (!target) throw createError("Referred user not found", 404);

  const referrer = await findUserByReferralCode(referralCode);
  if (!referrer) throw createError("Referral code not found", 404);

  if (referrer.id === referredUserId) {
    throw createError("Self-referrals are not allowed", 409);
  }

  const reverseReferral = await findReferralByReferrerAndReferred(referredUserId, referrer.id);
  if (reverseReferral) {
    throw createError("Referral cycle detected", 409);
  }

  const existingReferral = await findReferralByReferredId(referredUserId);
  if (existingReferral) {
    throw createError("User already has a referral attribution", 409);
  }

  const referral = await createReferral({
    referrer_id: referrer.id,
    referred_id: referredUserId,
  });

  await query(
    `INSERT INTO audit_log (actor_id, action, entity, entity_key, before, after)
     VALUES ($1, 'referral_manual_attribution', 'referral', $2, $3, $4)`,
    [
      req.user!.sub,
      referral.id,
      JSON.stringify({
        referredUserId,
        referralCode,
        reason: "Fingerprint collision guard override",
      }),
      JSON.stringify({
        referralId: referral.id,
        referrerId: referrer.id,
        referredId: referredUserId,
        adminReason: reason,
      }),
    ]
  );

  logger.info("Manual referral attribution created", {
    referralId: referral.id,
    referrerId: referrer.id,
    referredId: referredUserId,
    adminId: req.user!.sub,
    reason,
  });

  res.status(201).json({
    referral: {
      id: referral.id,
      referrerId: referral.referrer_id,
      referredId: referral.referred_id,
      createdAt: referral.created_at,
    },
    message: "Manual referral attribution created",
  });
});

export default router;
