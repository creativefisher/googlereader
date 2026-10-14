import { z } from "zod";

import { markArticleRead, markArticleStarred } from "@/lib/articles/read-state";
import { jsonError, jsonOk } from "@/lib/api/response";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { ensureDefaultUser } from "@/lib/db/user";

const schema = z.object({
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  await ensureDefaultUser();
  const body = schema.safeParse(await request.json());
  if (!body.success) return jsonError("Invalid request body");
  const { isRead, isStarred } = body.data;
  if (typeof isRead === "boolean") {
    await markArticleRead(DEFAULT_USER_ID, params.id, isRead);
  }
  if (typeof isStarred === "boolean") {
    await markArticleStarred(DEFAULT_USER_ID, params.id, isStarred);
  }
  return jsonOk({ ok: true });
}
