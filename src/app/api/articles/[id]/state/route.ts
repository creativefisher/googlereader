import { Prisma } from "@prisma/client";
import { z } from "zod";

import { parseJsonBody } from "@/lib/api/parse-json";
import { jsonError, jsonOk } from "@/lib/api/response";
import { articleExistsForUser } from "@/lib/articles/queries";
import { markArticleRead, markArticleStarred } from "@/lib/articles/read-state";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { ensureDefaultUser } from "@/lib/db/user";

const schema = z.object({
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  await ensureDefaultUser();
  const body = await parseJsonBody(request, schema);
  if (!body.success) {
    return jsonError("Invalid request body", 400);
  }

  const exists = await articleExistsForUser(params.id, DEFAULT_USER_ID);
  if (!exists) {
    return jsonError("Article not found", 404);
  }

  const { isRead, isStarred } = body.data;
  try {
    if (typeof isRead === "boolean") {
      await markArticleRead(DEFAULT_USER_ID, params.id, isRead);
    }
    if (typeof isStarred === "boolean") {
      await markArticleStarred(DEFAULT_USER_ID, params.id, isStarred);
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return jsonError("Article not found", 404);
    }
    throw error;
  }
  return jsonOk({ ok: true });
}
