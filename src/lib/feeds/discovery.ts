import { FEED_FETCH_TIMEOUT_MS } from "@/lib/constants";
import { fetchWithSafeRedirects } from "@/lib/security/safe-fetch";
import { assertSafeFetchUrl, normalizeHttpUrl } from "@/lib/security/url";

const LINK_TAG_RE = /<link\b[^>]*>/gi;
const ATTR_RE = (name: string) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i");

const FEED_HREF_RE =
  /\bhref\s*=\s*["']([^"']*(?:\/feed(?:\.(?:atom|xml|rss))?|\/rss(?:\.xml)?|\/atom\.xml|feed\.xml)[^"']*)["']/gi;

function isFeedType(type: string | null): boolean {
  if (!type) return true;
  const lower = type.toLowerCase();
  return (
    lower.includes("rss") ||
    lower.includes("atom") ||
    lower.includes("xml")
  );
}

function relIncludesAlternate(rel: string | undefined): boolean {
  if (!rel) return false;
  return rel.toLowerCase().split(/\s+/).includes("alternate");
}

function collectFeedCandidates(html: string, baseUrl: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const pushCandidate = (rawHref: string) => {
    try {
      const feedUrl = new URL(rawHref, baseUrl).toString();
      if (seen.has(feedUrl)) return;
      seen.add(feedUrl);
      candidates.push(feedUrl);
    } catch {
      // skip invalid href
    }
  };

  const linkTags = html.match(LINK_TAG_RE) ?? [];
  for (const tag of linkTags) {
    const rel = tag.match(ATTR_RE("rel"))?.[1];
    if (!relIncludesAlternate(rel)) continue;
    const type = tag.match(ATTR_RE("type"))?.[1] ?? null;
    if (!isFeedType(type)) continue;
    const href = tag.match(ATTR_RE("href"))?.[1];
    if (!href) continue;
    pushCandidate(href);
  }

  for (const match of html.matchAll(FEED_HREF_RE)) {
    if (match[1]) pushCandidate(match[1]);
  }

  return candidates;
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
    const candidates = collectFeedCandidates(html, finalUrl);
    return candidates[0] ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
