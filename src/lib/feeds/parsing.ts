import Parser from "rss-parser";

import { normalizeParsedFeed } from "@/lib/feeds/normalization";
import type { NormalizedFeed } from "@/lib/feeds/types";

const parser = new Parser({
  timeout: 10_000,
  customFields: {
    item: [
      ["content:encoded", "content"],
      ["dc:creator", "creator"],
    ],
  },
});

export class FeedParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedParseError";
  }
}

export async function parseFeedXml(xml: string): Promise<NormalizedFeed> {
  if (!xml.trim()) {
    throw new FeedParseError("Empty feed body");
  }
  try {
    const parsed = await parser.parseString(xml);
    return normalizeParsedFeed(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parse error";
    throw new FeedParseError(`Failed to parse feed: ${message}`);
  }
}
