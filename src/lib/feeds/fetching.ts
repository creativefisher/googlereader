import { FEED_FETCH_TIMEOUT_MS } from "@/lib/constants";
import type { FetchFeedResult } from "@/lib/feeds/types";
import { SafeFetchError, fetchWithSafeRedirects } from "@/lib/security/safe-fetch";
import { assertSafeFetchUrl } from "@/lib/security/url";

export class FeedFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedFetchError";
  }
}

export async function fetchFeedContent(
  feedUrl: string,
  options?: { etag?: string | null; lastModified?: string | null },
): Promise<FetchFeedResult> {
  await assertSafeFetchUrl(feedUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      "User-Agent": "Mozilla/5.0 (compatible; GoogleReaderClone/1.0; +https://github.com/creativefisher/googlereader)",
    };
    if (options?.etag) headers["If-None-Match"] = options.etag;
    if (options?.lastModified) headers["If-Modified-Since"] = options.lastModified;

    const { response, finalUrl } = await fetchWithSafeRedirects(feedUrl, {
      signal: controller.signal,
      headers,
    });

    if (response.status === 304) {
      return {
        body: "",
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
        finalUrl,
      };
    }

    if (!response.ok) {
      const reason = response.statusText ? ` ${response.statusText}` : "";
      const hint =
        response.status === 401 || response.status === 403 || response.status === 429
          ? " (the site may be blocking automated requests)"
          : response.status === 404
            ? " (feed not found at this URL)"
            : "";
      throw new FeedFetchError(`Feed server returned HTTP ${response.status}${reason}${hint}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/html") && !contentType.includes("xml")) {
      throw new FeedFetchError("URL returned HTML instead of a feed");
    }

    const body = await response.text();
    return {
      body,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      finalUrl,
    };
  } catch (error) {
    if (error instanceof FeedFetchError) throw error;
    if (error instanceof SafeFetchError) throw new FeedFetchError(error.message);
    if (error instanceof Error && error.name === "AbortError") {
      throw new FeedFetchError("Feed request timed out");
    }
    const message = error instanceof Error ? error.message : "Fetch failed";
    throw new FeedFetchError(message);
  } finally {
    clearTimeout(timeout);
  }
}
