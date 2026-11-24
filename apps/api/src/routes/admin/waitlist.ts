import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { requireAdmin } from "../../middleware/require-admin";
import { query } from "../../db/index";
import { encodeCursor, decodeCursorSafe, buildCursorWhereSimple } from "../../db/pagination";

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

/**
 * GET /admin/waitlist
 * Paginated export of waitlist entries for admin use.
 * Cursor encodes (created_at, id) from the previous page's last row — matching
 * the ORDER BY — since filtering by id alone while ordering by created_at
 * produced incorrect pages for non-monotonic UUID ids.
 */
router.get("/", async (req, res) => {
  const { limit, cursor } = ListQuerySchema.parse(req.query);
  const cursorValues = decodeCursorSafe(cursor, ["created_at", "id"]);

  const { clause, params: cursorParams } = cursorValues
    ? buildCursorWhereSimple("created_at", "DESC", cursorValues.created_at, cursorValues.id as string, 1)
    : { clause: "", params: [] as unknown[] };

  const rows = await query<{
    id: string;
    email: string;
    referral_code: string | null;
    created_at: string;
  }>(
    `SELECT id, email, referral_code, created_at
     FROM waitlist
     WHERE TRUE ${clause}
     ORDER BY created_at DESC, id DESC
     LIMIT $${cursorParams.length + 1}`,
    [...cursorParams, limit + 1]
  );

  const hasMore = rows.rows.length > limit;
  const data = rows.rows.slice(0, limit);
  const last = data[data.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor({ created_at: last.created_at, id: last.id }) : null;

  res.json({ data, nextCursor });
});

export default router;
