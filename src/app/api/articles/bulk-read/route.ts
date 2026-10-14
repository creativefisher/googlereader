import { z } from "zod";

import { bulkMarkRead, bulkMarkReadInFeed } from "@/lib/articles/read-state";
import { jsonError, jsonOk } from "@/lib/api/response";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { ensureDefaultUser } from "@/lib/db/user";

const schema = z.object({
  articleIds: z.array(z.string()).optional(),
  feedId: z.string().optional(),
});

export async function POST(request: Request) {
  await ensureDefaultUser();
  const body = schema.safeParse(await request.json());
  if (!body.success) return jsonError("Invalid request body");
  if (body.data.feedId) {
    const result = await bulkMarkReadInFeed(DEFAULT_USER_ID, body.data.feedId);
    return jsonOk(result);
  }
  if (body.data.articleIds) {
    const result = await bulkMarkRead(DEFAULT_USER_ID, body.data.articleIds);
    return jsonOk(result);
  }
  return jsonError("articleIds or feedId required");
}
