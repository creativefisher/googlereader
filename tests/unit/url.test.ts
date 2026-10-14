import { describe, expect, it } from "vitest";

import { assertSafeFetchUrl, normalizeHttpUrl, UrlValidationError } from "@/lib/security/url";

describe("normalizeHttpUrl", () => {
  it("adds https scheme when missing", () => {
    const url = normalizeHttpUrl("example.com/feed.xml");
    expect(url.toString()).toBe("https://example.com/feed.xml");
  });

  it("rejects unsupported protocols", () => {
    expect(() => normalizeHttpUrl("ftp://example.com/feed")).toThrow(UrlValidationError);
  });

  it("rejects credentials in URL", () => {
    expect(() => normalizeHttpUrl("https://user:pass@example.com/feed")).toThrow(UrlValidationError);
  });
});

describe("assertSafeFetchUrl IPv4-mapped IPv6", () => {
  it("blocks hex-mapped private IPv4 addresses", async () => {
    await expect(assertSafeFetchUrl("http://[::ffff:7f00:1]/feed")).rejects.toThrow(UrlValidationError);
  });
});
