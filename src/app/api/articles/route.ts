import { z } from "zod";

import { listArticles } from "@/lib/articles/queries";
import { jsonError, jsonOk } from "@/lib/api/response";
import { ensureDefaultUser } from "@/lib/db/user";

const querySchema = z.object({
  feedId: z.string().optional(),
  folderId: z.string().optional(),
  filter: z.enum(["all", "unread"]).default("all"),
  sort: z.enum(["newest", "oldest"]).default("newest"),
  cursor: z.string().optional(),
  starred: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  search: z.string().optional(),
});

export async function GET(request: Request) {
  await ensureDefaultUser();
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) {
    return jsonError("Invalid query parameters", 400);
  }
  const q = parsed.data;
  const result = await listArticles({
    feedId: q.feedId,
    folderId: q.folderId,
    filter: q.filter,
    sort: q.sort,
    cursor: q.cursor,
    starred: q.starred,
    search: q.search,
  });
  return jsonOk(result);
}

export const dynamic = "force-dynamic";
