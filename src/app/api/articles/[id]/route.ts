import { sanitizeArticleHtml } from "@/lib/articles/sanitization";
import { getArticleById } from "@/lib/articles/queries";
import { jsonError, jsonOk } from "@/lib/api/response";
import { ensureDefaultUser } from "@/lib/db/user";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  await ensureDefaultUser();
  const article = await getArticleById(params.id);
  if (!article) return jsonError("Article not found", 404);
  return jsonOk({
    id: article.id,
    feedId: article.feedId,
    title: article.title,
    author: article.author,
    summary: article.summary,
    url: article.url,
    publishedAt: article.publishedAt?.toISOString() ?? null,
    contentHtml: article.contentHtml,
    feedTitle: article.feedTitle,
    isRead: article.isRead,
    isStarred: article.isStarred,
    feed: article.feed,
    sanitizedHtml: sanitizeArticleHtml(article.contentHtml ?? article.summary ?? ""),
  });
}
