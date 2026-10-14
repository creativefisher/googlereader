import { computeArticleFingerprint } from "@/lib/feeds/deduplication";
import type { NormalizedArticle, NormalizedFeed } from "@/lib/feeds/types";

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function pickContent(item: {
  content?: string;
  contentSnippet?: string;
  summary?: string;
  description?: string;
}): { summary: string | null; contentHtml: string | null } {
  const rawContent = item.content ?? item.summary ?? item.description ?? null;
  const snippet = item.contentSnippet ?? (rawContent ? stripHtml(rawContent) : null);
  return {
    summary: snippet ? snippet.slice(0, 500) : null,
    contentHtml: rawContent,
  };
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeParsedFeed(
  feed: {
    title?: string;
    description?: string;
    link?: string;
    items: Array<{
      guid?: string;
      id?: string;
      link?: string;
      title?: string;
      creator?: string;
      author?: string;
      isoDate?: string;
      pubDate?: string;
      content?: string;
      contentSnippet?: string;
      summary?: string;
      description?: string;
    }>;
  },
): NormalizedFeed {
  const articles: NormalizedArticle[] = feed.items.map((item) => {
    const guid = item.guid ?? item.id ?? null;
    const url = item.link ?? null;
    const title = item.title?.trim() || "Untitled";
    const author = item.creator ?? item.author ?? null;
    const publishedAt = parseDate(item.isoDate ?? item.pubDate);
    const { summary, contentHtml } = pickContent(item);
    const fingerprint = computeArticleFingerprint({ guid, url, title, publishedAt });
    return {
      guid,
      url,
      title,
      author,
      summary,
      contentHtml,
      publishedAt,
      fingerprint,
    };
  });

  return {
    title: feed.title?.trim() || "Untitled Feed",
    description: feed.description?.trim() ?? null,
    siteUrl: feed.link ?? null,
    articles,
  };
}
