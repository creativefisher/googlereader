import { describe, expect, it } from "vitest";

import { sanitizeArticleHtml } from "@/lib/articles/sanitization";

describe("sanitizeArticleHtml", () => {
  it("removes script tags", () => {
    const html = sanitizeArticleHtml('<p>Hello</p><script>alert("x")</script>');
    expect(html).not.toContain("script");
    expect(html).toContain("Hello");
  });
});
