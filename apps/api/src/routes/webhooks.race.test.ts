import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Models the rows the deposit route touches. The fake mirrors the SQL semantics
// that matter for the race: activation is a compare-and-set on `status`, and
// `deposit_tx_hash` is UNIQUE across challenges.
const fake = vi.hoisted(() => {
  type Row = {
    id: string;
    memo: string;
    status: string;
    pool_amount_usdc: string;
    deposit_tx_hash: string | null;
  };
  return {
    rows: [] as Row[],
    // Runs after the route has read the challenge, before it activates. Lets a
    // test hold two requests inside the window where both see `pending_deposit`.
    beforeRead: undefined as undefined | (() => Promise<void>),
    // Simulates the duplicate-tx pre-check missing a concurrent commit.
    hideHashCheck: false,
  };
});

vi.mock("../db/queries/challenges", () => ({
  getChallengeByDepositTxHash: vi.fn(async (txHash: string) => {
    if (fake.hideHashCheck) return null;
    return fake.rows.find((r) => r.deposit_tx_hash === txHash) ?? null;
  }),
  getChallengeByMemo: vi.fn(async (memo: string) => {
    const row = fake.rows.find((r) => r.memo === memo);
    if (!row) return null;
    const snapshot = { ...row };
    await fake.beforeRead?.();
    return snapshot;
  }),
  activateChallengeFromDeposit: vi.fn(async (id: string, txHash: string) => {
    // Yield so another in-flight request can interleave before the write.
    await Promise.resolve();
    const owner = fake.rows.find((r) => r.deposit_tx_hash === txHash);
    if (owner && owner.id !== id) {
      throw Object.assign(new Error("duplicate key value violates unique constraint"), {
        code: "23505",
      });
    }
    const row = fake.rows.find((r) => r.id === id);
    if (!row || row.status !== "pending_deposit") return false;
    row.status = "active";
    row.deposit_tx_hash = txHash;
    return true;
  }),
}));

vi.mock("../db/queries/payouts", () => ({
  findPayoutByTxHash: vi.fn(async () => null),
}));

vi.mock("../middleware/rate-limit", () => ({
  webhookLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Signature checks are covered by verify-webhook's own tests; here we isolate the route.
vi.mock("../middleware/verify-webhook", () => ({
  verifyWebhook: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/config", () => ({
  config: { HOT_WALLET_PUBLIC_KEY: "GHOTWALLET", STELLAR_NETWORK: "testnet" },
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@brandblitz/stellar", () => ({
  // 10 000 USDC in stroops: always enough for the fixtures below.
  getAccountUsdcBalance: vi.fn(async () => 100_000_000_000n),
}));

import webhooksRouter from "./webhooks";
import { activateChallengeFromDeposit, getChallengeByMemo } from "../db/queries/challenges";

const MEMO = "11111111-1111-4111-8111-111111111111";
const OTHER_MEMO = "22222222-2222-4222-8222-222222222222";
const TX_HASH = "a".repeat(64);

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  fake.rows.length = 0;
  fake.rows.push({
    id: "challenge-a",
    memo: MEMO,
    status: "pending_deposit",
    pool_amount_usdc: "10.0000000",
    deposit_tx_hash: null,
  });
  fake.beforeRead = undefined;
  fake.hideHashCheck = false;
  vi.clearAllMocks();

  const app = express();
  app.use(express.json());
  app.use("/webhooks", webhooksRouter);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function deliver(memo: string, txHash: string = TX_HASH) {
  // Each delivery carries its own webhook id, as a retried deposit-monitor call would.
  return fetch(`${baseUrl}/webhooks/stellar/deposit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Id": crypto.randomUUID(),
    },
    body: JSON.stringify({ memo, txHash, amount: "10.0000000" }),
  });
}

describe("POST /webhooks/stellar/deposit: concurrent deliveries", () => {
  it("activates only one challenge when two deliveries for the same txHash race", async () => {
    // Hold both requests after their reads, so both observe `pending_deposit`.
    let arrived = 0;
    let openGate!: () => void;
    const gate = new Promise<void>((resolve) => (openGate = resolve));
    fake.beforeRead = async () => {
      arrived += 1;
      if (arrived === 2) openGate();
      await gate;
    };

    const [first, second] = await Promise.all([deliver(MEMO), deliver(MEMO)]);
    const bodies = [await first.json(), await second.json()];

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const statuses = bodies.map((b) => b.status).sort();
    expect(statuses).toEqual(["activated", "already_processed"]);

    // Both requests reached the compare-and-set, and exactly one activated.
    expect(activateChallengeFromDeposit).toHaveBeenCalledTimes(2);
    expect(fake.rows[0].status).toBe("active");
    expect(fake.rows[0].deposit_tx_hash).toBe(TX_HASH);
  });

  it("fails closed as a duplicate when the txHash is already attached to another challenge", async () => {
    fake.rows.push({
      id: "challenge-b",
      memo: OTHER_MEMO,
      status: "active",
      pool_amount_usdc: "10.0000000",
      deposit_tx_hash: TX_HASH,
    });
    // The pre-check misses the committed row, as it would under a race.
    fake.hideHashCheck = true;

    const res = await deliver(MEMO);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "duplicate_tx_ignored" });
    expect(fake.rows[0].status).toBe("pending_deposit");
    expect(fake.rows[0].deposit_tx_hash).toBeNull();
  });

  it("keeps the existing single-request duplicate behaviour: a retry with the same txHash is ignored", async () => {
    const first = await deliver(MEMO);
    expect(await first.json()).toEqual({ status: "activated", challengeId: "challenge-a" });

    const retry = await deliver(MEMO);

    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ status: "duplicate_tx_ignored" });
    expect(activateChallengeFromDeposit).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for an unknown memo and never attempts activation", async () => {
    const res = await deliver("33333333-3333-4333-8333-333333333333");

    expect(res.status).toBe(404);
    expect(activateChallengeFromDeposit).not.toHaveBeenCalled();
    expect(getChallengeByMemo).toHaveBeenCalledTimes(1);
  });
});
