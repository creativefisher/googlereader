import { FEED_FETCH_TIMEOUT_MS } from "@/lib/constants";
import { fetchWithSafeRedirects } from "@/lib/security/safe-fetch";
import { assertSafeFetchUrl, normalizeHttpUrl } from "@/lib/security/url";

const LINK_RE =
  /<link[^>]+rel=["']alternate["'][^>]*>/gi;
const HREF_RE = /href=["']([^"']+)["']/i;
const TYPE_RE = /type=["']([^"']+)["']/i;

function isFeedType(type: string | null): boolean {
  if (!type) return true;
  const lower = type.toLowerCase();
  return (
    lower.includes("rss") ||
    lower.includes("atom") ||
    lower.includes("xml")
  );
}

export async function discoverFeedUrl(siteUrl: string): Promise<string | null> {
  const normalized = normalizeHttpUrl(siteUrl);
  await assertSafeFetchUrl(normalized.toString());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS);
  try {
    const { response, finalUrl } = await fetchWithSafeRedirects(normalized.toString(), {
      signal: controller.signal,
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    if (!response.ok) return null;
    const html = await response.text();
    const candidates: string[] = [];
    const linkTags = html.match(LINK_RE) ?? [];
    for (const tag of linkTags) {
      const typeMatch = tag.match(TYPE_RE);
      if (!isFeedType(typeMatch?.[1] ?? null)) continue;
      const hrefMatch = tag.match(HREF_RE);
      if (!hrefMatch?.[1]) continue;
      try {
        const feedUrl = new URL(hrefMatch[1], finalUrl).toString();
        candidates.push(feedUrl);
      } catch {
        // skip invalid href
      }
    }
    return candidates[0] ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
