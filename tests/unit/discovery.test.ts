import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/safe-fetch", () => ({
  fetchWithSafeRedirects: vi.fn(),
}));

const { fetchWithSafeRedirects } = await import("@/lib/security/safe-fetch");
const mockedFetch = vi.mocked(fetchWithSafeRedirects);

describe("discoverFeedUrl", () => {
  it("finds rel=alternate feeds regardless of attribute order", async () => {
    mockedFetch.mockResolvedValueOnce({
      finalUrl: "https://example.com/",
      response: {
        ok: true,
        text: async () =>
          `<html><head><link rel="alternate" type="application/atom+xml" href="/feed.atom"></head></html>`,
      },
    } as Awaited<ReturnType<typeof fetchWithSafeRedirects>>);

    const { discoverFeedUrl } = await import("@/lib/feeds/discovery");
    await expect(discoverFeedUrl("https://example.com")).resolves.toBe("https://example.com/feed.atom");
  });

  it("finds feed links in page content when head tags are missing", async () => {
    mockedFetch.mockResolvedValueOnce({
      finalUrl: "https://martinfowler.com/",
      response: {
        ok: true,
        text: async () => `<html><body><a href = '/feed.atom'>RSS</a></body></html>`,
      },
    } as Awaited<ReturnType<typeof fetchWithSafeRedirects>>);

    const { discoverFeedUrl } = await import("@/lib/feeds/discovery");
    await expect(discoverFeedUrl("https://martinfowler.com/")).resolves.toBe(
      "https://martinfowler.com/feed.atom",
    );
  });
});
