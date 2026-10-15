import { lookup } from "node:dns/promises";
import { fetch as undiciFetch, Response as UndiciResponse } from "undici";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof import("undici")>();
  return {
    ...actual,
    fetch: vi.fn(),
  };
});

const mockedLookup = vi.mocked(lookup);
const mockedUndiciFetch = vi.mocked(undiciFetch);

describe("safe-fetch redirect handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("treats 304 as a final response, not a redirect", async () => {
    mockedLookup.mockImplementationOnce((async () => [
      { address: "93.184.216.34", family: 4 },
    ]) as unknown as typeof lookup);
    mockedUndiciFetch.mockResolvedValueOnce(
      new UndiciResponse(null, { status: 304, headers: { etag: '"abc"' } }),
    );

    const { fetchWithSafeRedirects } = await import("@/lib/security/safe-fetch");
    const { response } = await fetchWithSafeRedirects("https://example.com/feed.xml");
    expect(response.status).toBe(304);
  });

  it("requests the original hostname while pinning DNS to public addresses", async () => {
    mockedLookup.mockImplementationOnce((async () => [
      { address: "93.184.216.34", family: 4 },
    ]) as unknown as typeof lookup);
    mockedUndiciFetch.mockResolvedValueOnce(new UndiciResponse("ok", { status: 200 }));

    const { fetchWithSafeRedirects } = await import("@/lib/security/safe-fetch");
    await fetchWithSafeRedirects("https://example.com/feed.xml");

    expect(mockedUndiciFetch).toHaveBeenCalledTimes(1);
    const call = mockedUndiciFetch.mock.calls[0] as unknown as [
      URL | string,
      { dispatcher?: unknown },
    ];
    expect(String(call[0])).toBe("https://example.com/feed.xml");
    expect(call[1].dispatcher).toBeDefined();
  });
});

describe("safe-fetch on Cloudflare Workers (regression: every feed failed with 'fetch failed')", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the platform fetch (not undici's socket dispatcher) and follows validated redirects", async () => {
    mockedLookup.mockImplementation((async () => [
      { address: "76.76.21.21", family: 4 },
    ]) as unknown as typeof lookup);
    const platformFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 308, headers: { location: "https://www.cursor.com/changelog/rss.xml" } }),
      )
      .mockResolvedValueOnce(new Response("<rss></rss>", { status: 200 }));
    vi.stubGlobal("fetch", platformFetch);

    const { fetchWithSafeRedirects } = await import("@/lib/security/safe-fetch");
    const { response, finalUrl } = await fetchWithSafeRedirects("https://cursor.com/changelog/rss.xml");

    expect(response.status).toBe(200);
    expect(finalUrl).toBe("https://www.cursor.com/changelog/rss.xml");
    expect(mockedUndiciFetch).not.toHaveBeenCalled();
    expect(platformFetch).toHaveBeenCalledTimes(2);
    expect(platformFetch.mock.calls[0][0]).toBe("https://cursor.com/changelog/rss.xml");
    expect(platformFetch.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  });

  it("still blocks redirects to private addresses", async () => {
    mockedLookup.mockImplementation((async () => [
      { address: "76.76.21.21", family: 4 },
    ]) as unknown as typeof lookup);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } }),
      ),
    );
    const { fetchWithSafeRedirects } = await import("@/lib/security/safe-fetch");
    await expect(fetchWithSafeRedirects("https://example.com/feed.xml")).rejects.toThrow();
  });
});

describe("describeFetchError", () => {
  it("includes the underlying cause instead of a bare 'fetch failed'", async () => {
    const { describeFetchError } = await import("@/lib/security/safe-fetch");
    const cause = Object.assign(new Error("getaddrinfo ENOTFOUND nope.invalid"), { code: "ENOTFOUND" });
    const error = new TypeError("fetch failed", { cause });
    expect(describeFetchError(error)).toBe(
      "Could not connect to the feed server (ENOTFOUND: getaddrinfo ENOTFOUND nope.invalid)",
    );
    expect(describeFetchError(new TypeError("fetch failed"))).toBe("Could not connect to the feed server");
  });
});
