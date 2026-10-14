import { describe, expect, it } from "vitest";

describe("safe-fetch redirect handling", () => {
  it("treats 304 as a final response, not a redirect", async () => {
    const originalFetch = global.fetch;
    global.fetch = (async () =>
      new Response(null, { status: 304, headers: { etag: '"abc"' } })) as typeof fetch;
    try {
      const { fetchWithSafeRedirects } = await import("@/lib/security/safe-fetch");
      const { response } = await fetchWithSafeRedirects("https://example.com/feed.xml");
      expect(response.status).toBe(304);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
