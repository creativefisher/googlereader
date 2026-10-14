import { describe, expect, it } from "vitest";

import { encodeArticleCursor } from "@/lib/articles/queries";

describe("encodeArticleCursor", () => {
  it("encodes publishedAt and id", () => {
    const cursor = encodeArticleCursor(new Date("2025-01-01T00:00:00.000Z"), "abc123");
    expect(cursor).toBe("2025-01-01T00:00:00.000Z|abc123");
  });

  it("handles null publishedAt", () => {
    expect(encodeArticleCursor(null, "xyz")).toBe("|xyz");
  });
});
