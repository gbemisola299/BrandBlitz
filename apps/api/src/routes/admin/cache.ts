import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { requireAdmin } from "../../middleware/require-admin";
import { redis } from "../../lib/redis";
import { PUBLIC_CONFIG_CACHE_KEY } from "../config";
import { flushAntiCheatThresholdsCache } from "../../middleware/anti-cheat";
import { resetRateLimitCache } from "../../middleware/rate-limit";

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

/** POST /admin/cache/config/flush */
router.post("/config/flush", async (_req, res) => {
  await Promise.all([redis.del(PUBLIC_CONFIG_CACHE_KEY), flushAntiCheatThresholdsCache()]);
  resetRateLimitCache();
  res.status(204).end();
});

export default router;
