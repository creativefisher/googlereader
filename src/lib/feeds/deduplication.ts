import { createHash } from "node:crypto";

import type { NormalizedArticle } from "@/lib/feeds/types";

function normalizeForHash(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function computeArticleFingerprint(input: {
  guid?: string | null;
  url?: string | null;
  title?: string | null;
  publishedAt?: Date | null;
}): string {
  const guid = input.guid?.trim();
  if (guid) {
    return createHash("sha256").update(`guid:${normalizeForHash(guid)}`).digest("hex");
  }
  const url = input.url?.trim();
  if (url) {
    return createHash("sha256").update(`url:${normalizeForHash(url)}`).digest("hex");
  }
  const title = input.title?.trim() ?? "";
  const published = input.publishedAt?.toISOString() ?? "";
  return createHash("sha256")
    .update(`fallback:${normalizeForHash(title)}|${published}`)
    .digest("hex");
}

export function dedupeNormalizedArticles(articles: NormalizedArticle[]): NormalizedArticle[] {
  const seen = new Set<string>();
  const result: NormalizedArticle[] = [];
  for (const article of articles) {
    if (seen.has(article.fingerprint)) continue;
    seen.add(article.fingerprint);
    result.push(article);
  }
  return result;
}
