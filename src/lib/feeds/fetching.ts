import { FEED_FETCH_TIMEOUT_MS } from "@/lib/constants";
import type { FetchFeedResult } from "@/lib/feeds/types";
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
  const safeUrl = await assertSafeFetchUrl(feedUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      "User-Agent": "GoogleReaderClone/1.0 (+https://github.com/local/rss-reader)",
    };
    if (options?.etag) headers["If-None-Match"] = options.etag;
    if (options?.lastModified) headers["If-Modified-Since"] = options.lastModified;

    const response = await fetch(safeUrl.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers,
    });

    if (response.status === 304) {
      return {
        body: "",
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
        finalUrl: response.url,
      };
    }

    if (!response.ok) {
      throw new FeedFetchError(`Feed server returned ${response.status}`);
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
      finalUrl: response.url,
    };
  } catch (error) {
    if (error instanceof FeedFetchError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new FeedFetchError("Feed request timed out");
    }
    const message = error instanceof Error ? error.message : "Fetch failed";
    throw new FeedFetchError(message);
  } finally {
    clearTimeout(timeout);
  }
}
