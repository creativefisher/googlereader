import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseFeedXml } from "@/lib/feeds/parsing";

const fixture = (name: string) =>
  readFileSync(path.join(process.cwd(), "tests/fixtures", name), "utf8");

describe("parseFeedXml", () => {
  it("parses RSS 2.0 fixtures", async () => {
    const feed = await parseFeedXml(fixture("sample-rss.xml"));
    expect(feed.title).toBe("Sample Tech Feed");
    expect(feed.articles.length).toBeGreaterThanOrEqual(2);
    expect(feed.articles[0].title).toContain("Welcome");
  });

  it("parses Atom fixtures", async () => {
    const feed = await parseFeedXml(fixture("sample-atom.xml"));
    expect(feed.title).toBe("Sample Atom Feed");
    expect(feed.articles[0].guid).toBe("atom-entry-1");
  });
});
