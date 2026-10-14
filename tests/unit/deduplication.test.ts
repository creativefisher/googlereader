import { describe, expect, it } from "vitest";

import {
  computeArticleFingerprint,
  dedupeNormalizedArticles,
} from "@/lib/feeds/deduplication";

describe("article deduplication", () => {
  it("prefers guid for fingerprinting", () => {
    const a = computeArticleFingerprint({ guid: "abc", url: "https://x.test/1", title: "T" });
    const b = computeArticleFingerprint({ guid: "abc", url: "https://x.test/2", title: "Other" });
    expect(a).toBe(b);
  });

  it("dedupes normalized articles by fingerprint", () => {
    const fp = computeArticleFingerprint({ guid: "same" });
    const articles = dedupeNormalizedArticles([
      {
        guid: "same",
        url: null,
        title: "One",
        author: null,
        summary: null,
        contentHtml: null,
        publishedAt: null,
        fingerprint: fp,
      },
      {
        guid: "same",
        url: null,
        title: "Duplicate",
        author: null,
        summary: null,
        contentHtml: null,
        publishedAt: null,
        fingerprint: fp,
      },
    ]);
    expect(articles).toHaveLength(1);
  });
});
