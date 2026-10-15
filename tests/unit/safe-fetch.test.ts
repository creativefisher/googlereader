import { lookup } from "node:dns/promises";
import { describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

const mockedLookup = vi.mocked(lookup);

describe("safe-fetch redirect handling", () => {
  it("treats 304 as a final response, not a redirect", async () => {
    mockedLookup.mockImplementationOnce((async () => [
      { address: "93.184.216.34", family: 4 },
    ]) as unknown as typeof lookup);

    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () =>
      new Response(null, { status: 304, headers: { etag: '"abc"' } }),
    ) as typeof fetch;

    try {
      vi.resetModules();
      const { fetchWithSafeRedirects } = await import("@/lib/security/safe-fetch");
      const { response } = await fetchWithSafeRedirects("https://example.com/feed.xml");
      expect(response.status).toBe(304);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("requests pinned public addresses with the original Host header", async () => {
    mockedLookup.mockImplementationOnce((async () => [
      { address: "93.184.216.34", family: 4 },
    ]) as unknown as typeof lookup);

    const originalFetch = global.fetch;
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    try {
      vi.resetModules();
      const { fetchWithSafeRedirects } = await import("@/lib/security/safe-fetch");
      await fetchWithSafeRedirects("https://example.com/feed.xml");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const call = fetchMock.mock.calls[0] as unknown as [URL | string, RequestInit & { dispatcher?: unknown }];
      expect(String(call[0])).toContain("93.184.216.34");
      expect(new Headers(call[1].headers).get("Host")).toBe("example.com");
      expect(call[1].dispatcher).toBeDefined();
    } finally {
      global.fetch = originalFetch;
    }
  });
});
