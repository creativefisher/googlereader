import { lookup } from "node:dns/promises";
import { fetch as undiciFetch, Response as UndiciResponse } from "undici";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it("requests pinned public addresses with the original Host header", async () => {
    mockedLookup.mockImplementationOnce((async () => [
      { address: "93.184.216.34", family: 4 },
    ]) as unknown as typeof lookup);
    mockedUndiciFetch.mockResolvedValueOnce(new UndiciResponse("ok", { status: 200 }));

    const { fetchWithSafeRedirects } = await import("@/lib/security/safe-fetch");
    await fetchWithSafeRedirects("https://example.com/feed.xml");

    expect(mockedUndiciFetch).toHaveBeenCalledTimes(1);
    const call = mockedUndiciFetch.mock.calls[0] as unknown as [
      URL | string,
      { headers: HeadersInit; dispatcher?: unknown },
    ];
    expect(String(call[0])).toContain("93.184.216.34");
    expect(new Headers(call[1].headers).get("Host")).toBe("example.com");
    expect(call[1].dispatcher).toBeDefined();
  });
});
