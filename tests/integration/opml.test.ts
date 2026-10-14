import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_USER_ID } from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";
import { exportSubscriptionsOpml, importSubscriptionsOpml } from "@/lib/opml/import-export";
import { ingestFeedFromXml } from "@/lib/feeds/ingestion";

afterEach(async () => {
  await prisma.articleState.deleteMany();
  await prisma.article.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.folder.deleteMany();
  await prisma.feed.deleteMany();
});

describe("OPML import/export", () => {
  it("exports and imports folder structure without duplicates", async () => {
    await prisma.user.upsert({
      where: { id: DEFAULT_USER_ID },
      create: { id: DEFAULT_USER_ID, settings: { create: {} } },
      update: {},
    });
    const folder = await prisma.folder.create({
      data: { userId: DEFAULT_USER_ID, name: "Tech" },
    });
    const feed = await prisma.feed.create({
      data: {
        url: "https://example.com/feeds/opml-fixture.xml",
        title: "Example Feed",
        siteUrl: "https://example.com",
      },
    });
    await prisma.subscription.create({
      data: { userId: DEFAULT_USER_ID, feedId: feed.id, folderId: folder.id },
    });

    const xml = await exportSubscriptionsOpml(DEFAULT_USER_ID);
    expect(xml).toContain("Example Feed");
    expect(xml).toContain("Tech");

    await prisma.subscription.deleteMany();
    const result = await importSubscriptionsOpml(DEFAULT_USER_ID, xml);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
  });
});

describe("article search", () => {
  it("finds articles by title", async () => {
    await prisma.user.upsert({
      where: { id: DEFAULT_USER_ID },
      create: { id: DEFAULT_USER_ID, settings: { create: {} } },
      update: {},
    });
    const feed = await prisma.feed.create({
      data: { url: "https://example.com/search.xml", title: "Search Feed" },
    });
    await prisma.subscription.create({
      data: { userId: DEFAULT_USER_ID, feedId: feed.id },
    });
    await ingestFeedFromXml(feed.id, `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title><item><guid>1</guid><title>Unique Quantum Headline</title></item></channel></rss>`);
    const { listArticles } = await import("@/lib/articles/queries");
    const result = await listArticles({ search: "Quantum" });
    expect(result.items.some((i) => i.title.includes("Quantum"))).toBe(true);
  });
});
