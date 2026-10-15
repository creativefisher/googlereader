import { lookup } from "node:dns/promises";
import { describe, expect, it, vi } from "vitest";

import { assertSafeFetchUrl, normalizeHttpUrl, UrlValidationError } from "@/lib/security/url";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

const mockedLookup = vi.mocked(lookup);

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

  it("blocks embedded private IPv4 in full mapped IPv6 form", async () => {
    await expect(
      assertSafeFetchUrl("http://[0000:0000:0000:0000:0000:ffff:127.0.0.1]/feed"),
    ).rejects.toThrow(UrlValidationError);
  });
});

describe("assertSafeFetchUrl DNS resolution", () => {
  it("allows hostnames when at least one public IPv4 address exists", async () => {
    mockedLookup.mockImplementationOnce((async () => [
      { address: "199.232.198.114", family: 4 },
      { address: "199.232.194.114", family: 4 },
      { address: "::ffff:127.0.0.1", family: 6 },
    ]) as unknown as typeof lookup);

    await expect(assertSafeFetchUrl("https://techradar.com/rss")).resolves.toMatchObject({
      hostname: "techradar.com",
    });
  });

  it("ignores spurious AAAA records when public A records exist", async () => {
    mockedLookup.mockImplementationOnce((async () => [
      { address: "151.101.22.114", family: 4 },
      { address: "::ffff:7f00:1", family: 6 },
    ]) as unknown as typeof lookup);

    await expect(assertSafeFetchUrl("https://www.techradar.com/rss")).resolves.toBeTruthy();
  });

  it("blocks when every resolved address is private", async () => {
    mockedLookup.mockImplementationOnce((async () => [
      { address: "127.0.0.1", family: 4 },
      { address: "::1", family: 6 },
    ]) as unknown as typeof lookup);

    await expect(assertSafeFetchUrl("https://internal.example/feed")).rejects.toThrow(
      /private or local address/i,
    );
  });

  it("blocks when only private IPv6 records exist", async () => {
    mockedLookup.mockImplementationOnce((async () => [{ address: "::ffff:7f00:1", family: 6 }]) as unknown as typeof lookup);

    await expect(assertSafeFetchUrl("https://internal.example/feed")).rejects.toThrow(
      /private or local address/i,
    );
  });
});
