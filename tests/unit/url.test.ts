import { lookup } from "node:dns/promises";
import { describe, expect, it, vi } from "vitest";

import {
  assertSafeFetchUrl,
  normalizeHttpUrl,
  pickPublicAddresses,
  resolveSafeFetchEndpoint,
  UrlValidationError,
} from "@/lib/security/url";

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

describe("pickPublicAddresses", () => {
  it("inspects both IPv4 and IPv6 records", () => {
    const pinned = pickPublicAddresses([
      { address: "2606:4700:10::6814:179a", family: 6 },
      { address: "::ffff:127.0.0.1", family: 6 },
    ]);
    expect(pinned).toEqual(["2606:4700:10::6814:179a"]);
  });

  it("rejects mixed responses when rejectMixed is enabled", () => {
    expect(() =>
      pickPublicAddresses(
        [
          { address: "199.232.198.114", family: 4 },
          { address: "::ffff:127.0.0.1", family: 6 },
        ],
        { rejectMixed: true },
      ),
    ).toThrow(/mixed public and private/i);
  });
});

describe("assertSafeFetchUrl DNS resolution", () => {
  it("allows mixed responses when at least one public address exists for pinned fetch", async () => {
    mockedLookup.mockImplementationOnce((async () => [
      { address: "199.232.198.114", family: 4 },
      { address: "199.232.194.114", family: 4 },
      { address: "::ffff:127.0.0.1", family: 6 },
    ]) as unknown as typeof lookup);

    await expect(assertSafeFetchUrl("https://techradar.com/rss")).resolves.toMatchObject({
      hostname: "techradar.com",
    });
  });

  it("returns pinned public addresses for safe fetch", async () => {
    mockedLookup.mockImplementationOnce((async () => [
      { address: "151.101.22.114", family: 4 },
      { address: "::ffff:7f00:1", family: 6 },
    ]) as unknown as typeof lookup);

    const endpoint = await resolveSafeFetchEndpoint("https://www.techradar.com/rss");
    expect(endpoint.pinnedAddresses).toEqual(["151.101.22.114"]);
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
