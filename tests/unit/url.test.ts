import { describe, expect, it } from "vitest";

import { normalizeHttpUrl, UrlValidationError } from "@/lib/security/url";

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
