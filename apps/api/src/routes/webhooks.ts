import { Router } from "express";
import { z } from "zod";
import {
  activateChallengeFromDeposit,
  getChallengeByDepositTxHash,
  getChallengeByMemo,
} from "../db/queries/challenges";
import { findPayoutByTxHash } from "../db/queries/payouts";
import { webhookLimiter } from "../middleware/rate-limit";
import { logger } from "../lib/logger";
import { config } from "../lib/config";
import { getAccountUsdcBalance } from "@brandblitz/stellar";

import { verifyWebhook } from "../middleware/verify-webhook";

const router = Router();

function usdcToStroops(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(`${whole}${fraction.padEnd(7, "0").slice(0, 7)}`);
}

const DepositWebhookSchema = z
  .object({
    memo: z.string().uuid("memo must be a valid UUID"),
    txHash: z.string().regex(/^[0-9a-fA-F]{64}$/, "txHash must be a 64-character hex string"),
    amount: z
      .string()
      .regex(/^\d+(\.\d{1,7})?$/, "amount must be a numeric string")
      .optional(),
  })
  .strict();

/**
 * POST /webhooks/stellar/deposit
 * Internal webhook: called by the deposit monitor when a matching USDC
 * payment is detected on-chain. Activates the challenge.
 *
 * Two layers stop a deposit from activating twice, and they guard different things:
 *
 * 1. Redis webhook-id dedup (verify-webhook.ts) keys on `X-Webhook-Id`. It absorbs
 *    redelivery of the same HTTP request, for example after an ack timeout, for 10 minutes.
 *    It cannot see a retry sent under a new webhook id.
 * 2. The database guards the on-chain event itself. The pre-check below is the fast path.
 *    The authoritative guard is `activateChallengeFromDeposit`: a compare-and-set on
 *    `status`, plus `deposit_tx_hash` UNIQUE. Concurrent retries with new webhook ids for
 *    the same txHash therefore still activate at most one challenge.
 */
router.post("/stellar/deposit", webhookLimiter, verifyWebhook, async (req, res) => {
  const body = DepositWebhookSchema.parse(req.body);

  const duplicateChallenge = await getChallengeByDepositTxHash(body.txHash);
  const duplicatePayout = await findPayoutByTxHash(body.txHash);
  if (duplicateChallenge || duplicatePayout) {
    res.status(200).json({ status: "duplicate_tx_ignored" });
    return;
  }

  const challenge = await getChallengeByMemo(body.memo);
  if (!challenge) {
    logger.warn("Deposit received for unknown challenge memo", {
      memo: body.memo,
      txHash: body.txHash,
    });
    res.status(404).json({ error: "Unknown memo" });
    return;
  }

  if (challenge.status !== "pending_deposit") {
    res.json({ status: "already_processed" });
    return;
  }

  const requiredBalance = usdcToStroops(challenge.pool_amount_usdc);
  const currentBalance = await getAccountUsdcBalance(
    config.HOT_WALLET_PUBLIC_KEY,
    config.STELLAR_NETWORK
  );
  if (currentBalance < requiredBalance) {
    res.status(422).json({
      code: "INSUFFICIENT_ESCROW_BALANCE",
      currentBalance: currentBalance.toString(),
      requiredAmount: requiredBalance.toString(),
    });
    return;
  }

  let activated: boolean;
  try {
    activated = await activateChallengeFromDeposit(challenge.id, body.txHash);
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      // deposit_tx_hash is already attached to another challenge.
      res.status(200).json({ status: "duplicate_tx_ignored" });
      return;
    }
    throw err;
  }
  if (!activated) {
    // A concurrent delivery activated this challenge first.
    res.json({ status: "already_processed" });
    return;
  }

  logger.info("Challenge activated via deposit", {
    challengeId: challenge.id,
    txHash: body.txHash,
    amount: body.amount,
  });

  res.json({ status: "activated", challengeId: challenge.id });
});

export default router;
