import { describe, expect, it } from "vitest";

import { decodeArticleCursor, encodeArticleCursor } from "@/lib/articles/queries";

describe("article cursor codec", () => {
  it("encodes publishedAt and id", () => {
    const cursor = encodeArticleCursor(new Date("2025-01-01T00:00:00.000Z"), "abc123");
    expect(cursor).toBe("2025-01-01T00:00:00.000Z|abc123");
  });

  it("handles null publishedAt on encode", () => {
    expect(encodeArticleCursor(null, "xyz")).toBe("|xyz");
  });

  it("decodes undated cursors with empty timestamp", () => {
    expect(decodeArticleCursor("|xyz")).toEqual({ publishedAt: null, id: "xyz" });
  });

  it("decodes dated cursors", () => {
    expect(decodeArticleCursor("2025-01-01T00:00:00.000Z|abc")).toEqual({
      publishedAt: new Date("2025-01-01T00:00:00.000Z"),
      id: "abc",
    });
  });

  it("rejects cursors without a separator", () => {
    expect(decodeArticleCursor("no-separator")).toBeNull();
  });
});
