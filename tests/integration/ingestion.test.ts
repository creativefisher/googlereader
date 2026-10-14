import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_USER_ID } from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";
import { ingestFeedFromXml, refreshFeedById } from "@/lib/feeds/ingestion";

const fixture = readFileSync(path.join(process.cwd(), "tests/fixtures/sample-rss.xml"), "utf8");

afterEach(async () => {
  await prisma.articleState.deleteMany();
  await prisma.article.deleteMany();
  await prisma.refreshLog.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.feed.deleteMany();
});

describe("feed ingestion pipeline", () => {
  it("persists articles and dedupes on repeated ingest", async () => {
    const feed = await prisma.feed.create({
      data: { url: "https://example.test/feed.xml", title: "Example" },
    });
    const first = await ingestFeedFromXml(feed.id, fixture);
    const second = await ingestFeedFromXml(feed.id, fixture);
    const count = await prisma.article.count({ where: { feedId: feed.id } });
    expect(first).toBeGreaterThan(0);
    expect(second).toBe(0);
    expect(count).toBe(first);
  });

  it("skips overlapping refresh attempts", async () => {
    const feed = await prisma.feed.create({
      data: {
        url: "https://example.test/feed-2.xml",
        title: "Example",
        refreshInProgress: true,
      },
    });
    const result = await refreshFeedById(feed.id);
    expect(result.error).toMatch(/already in progress/i);
  });
});

describe("read/unread state", () => {
  it("tracks unread counts", async () => {
    await prisma.user.upsert({
      where: { id: DEFAULT_USER_ID },
      create: { id: DEFAULT_USER_ID, settings: { create: {} } },
      update: {},
    });
    const feed = await prisma.feed.create({
      data: { url: "https://example.test/unread.xml", title: "Unread" },
    });
    await ingestFeedFromXml(feed.id, fixture);
    const articles = await prisma.article.findMany({ where: { feedId: feed.id } });
    expect(articles.length).toBeGreaterThan(0);
    await prisma.articleState.create({
      data: { userId: DEFAULT_USER_ID, articleId: articles[0].id, isRead: true },
    });
    const readCount = await prisma.articleState.count({
      where: { userId: DEFAULT_USER_ID, isRead: true },
    });
    expect(readCount).toBe(1);
  });
});
