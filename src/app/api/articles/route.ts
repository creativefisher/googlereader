import { listArticles } from "@/lib/articles/queries";
import { jsonOk } from "@/lib/api/response";
import { ensureDefaultUser } from "@/lib/db/user";

export async function GET(request: Request) {
  await ensureDefaultUser();
  const { searchParams } = new URL(request.url);
  const result = await listArticles({
    feedId: searchParams.get("feedId") ?? undefined,
    folderId: searchParams.get("folderId") ?? undefined,
    filter: (searchParams.get("filter") as "all" | "unread") ?? "all",
    sort: (searchParams.get("sort") as "newest" | "oldest") ?? "newest",
    cursor: searchParams.get("cursor") ?? undefined,
    starred: searchParams.get("starred") === "true",
    search: searchParams.get("search") ?? undefined,
  });
  return jsonOk(result);
}
