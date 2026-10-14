import { readFileSync } from "node:fs";
import path from "node:path";

import { DEFAULT_USER_ID } from "../src/lib/constants";
import { prisma } from "../src/lib/db/prisma";
import { ingestFeedFromXml } from "../src/lib/feeds/ingestion";

const fixture = (name: string) =>
  readFileSync(path.join(process.cwd(), "tests/fixtures", name), "utf8");

interface SeedFeed {
  url: string;
  title: string;
  siteUrl: string;
  fixture: string;
  folder?: string;
}

/** Canonical public sites for display; feed URLs use example.com so offline seed/refresh stays fixture-based. */
const FEEDS: SeedFeed[] = [
  {
    url: "https://example.com/offline-feeds/hacker-news.xml",
    title: "Hacker News",
    siteUrl: "https://news.ycombinator.com",
    fixture: "sample-rss.xml",
    folder: "Technology",
  },
  {
    url: "https://example.com/offline-feeds/techcrunch.xml",
    title: "TechCrunch",
    siteUrl: "https://techcrunch.com",
    fixture: "sample-rss.xml",
    folder: "Technology",
  },
  {
    url: "https://example.com/offline-feeds/ars-technica.xml",
    title: "Ars Technica",
    siteUrl: "https://arstechnica.com",
    fixture: "sample-rss.xml",
    folder: "Technology",
  },
  {
    url: "https://example.com/offline-feeds/the-verge.xml",
    title: "The Verge",
    siteUrl: "https://www.theverge.com",
    fixture: "sample-rss.xml",
    folder: "Technology",
  },
  {
    url: "https://example.com/offline-feeds/simon-willison.xml",
    title: "Simon Willison's Weblog",
    siteUrl: "https://simonwillison.net",
    fixture: "sample-atom.xml",
    folder: "Blogs",
  },
  {
    url: "https://example.com/offline-feeds/martin-fowler.xml",
    title: "Martin Fowler",
    siteUrl: "https://martinfowler.com",
    fixture: "sample-atom.xml",
    folder: "Blogs",
  },
];

async function main() {
  await prisma.user.upsert({
    where: { id: DEFAULT_USER_ID },
    create: {
      id: DEFAULT_USER_ID,
      email: "local@reader.app",
      settings: { create: {} },
    },
    update: {},
  });

  const folderIds = new Map<string, string>();
  for (const name of ["Technology", "Blogs"]) {
    const folder = await prisma.folder.upsert({
      where: { userId_name: { userId: DEFAULT_USER_ID, name } },
      create: { userId: DEFAULT_USER_ID, name, sortOrder: name === "Technology" ? 0 : 1 },
      update: {},
    });
    folderIds.set(name, folder.id);
  }

  let order = 0;
  for (const seedFeed of FEEDS) {
    const slug = seedFeed.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const xml = fixture(seedFeed.fixture).replace(/sample-/g, `${slug}-`);
    const feed = await prisma.feed.upsert({
      where: { url: seedFeed.url },
      create: {
        url: seedFeed.url,
        title: seedFeed.title,
        siteUrl: seedFeed.siteUrl,
        description: `${seedFeed.title} (offline seed)`,
        lastFetchedAt: new Date(),
      },
      update: {
        title: seedFeed.title,
        siteUrl: seedFeed.siteUrl,
      },
    });

    await prisma.subscription.upsert({
      where: { userId_feedId: { userId: DEFAULT_USER_ID, feedId: feed.id } },
      create: {
        userId: DEFAULT_USER_ID,
        feedId: feed.id,
        folderId: seedFeed.folder ? folderIds.get(seedFeed.folder) : null,
        sortOrder: order++,
      },
      update: {
        folderId: seedFeed.folder ? folderIds.get(seedFeed.folder) : null,
        sortOrder: order,
      },
    });

    await ingestFeedFromXml(feed.id, xml, {
      title: seedFeed.title,
      siteUrl: seedFeed.siteUrl,
      description: `${seedFeed.title} (offline seed)`,
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
