import { dedupeNormalizedArticles } from "@/lib/feeds/deduplication";
import { fetchFeedContent } from "@/lib/feeds/fetching";
import { parseFeedXml } from "@/lib/feeds/parsing";
import type { NormalizedFeed } from "@/lib/feeds/types";
import { prisma } from "@/lib/db/prisma";
import { assertSafeFetchUrl, normalizeHttpUrl } from "@/lib/security/url";

export interface IngestionResult {
  feedId: string;
  articlesAdded: number;
  notModified: boolean;
  error?: string;
}

export async function ingestFeedFromXml(
  feedId: string,
  xml: string,
  metadata?: Partial<Pick<NormalizedFeed, "title" | "description" | "siteUrl">>,
): Promise<number> {
  const parsed = await parseFeedXml(xml);
  const feedMeta = {
    title: metadata?.title ?? parsed.title,
    description: metadata?.description ?? parsed.description,
    siteUrl: metadata?.siteUrl ?? parsed.siteUrl,
  };

  await prisma.feed.update({
    where: { id: feedId },
    data: {
      title: feedMeta.title,
      description: feedMeta.description,
      siteUrl: feedMeta.siteUrl,
    },
  });

  const articles = dedupeNormalizedArticles(parsed.articles);
  let added = 0;
  for (const article of articles) {
    const existing = await prisma.article.findUnique({
      where: { fingerprint: article.fingerprint },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.article.create({
      data: {
        feedId,
        guid: article.guid,
        url: article.url,
        title: article.title,
        author: article.author,
        summary: article.summary,
        contentHtml: article.contentHtml,
        publishedAt: article.publishedAt,
        fingerprint: article.fingerprint,
      },
    });
    added += 1;
  }
  return added;
}

export async function refreshFeedById(feedId: string): Promise<IngestionResult> {
  const feed = await prisma.feed.findUnique({ where: { id: feedId } });
  if (!feed) {
    return { feedId, articlesAdded: 0, notModified: false, error: "Feed not found" };
  }

  const log = await prisma.refreshLog.create({
    data: { feedId, status: "running" },
  });

  try {
    const locked = await prisma.feed.updateMany({
      where: { id: feedId, refreshInProgress: false },
      data: { refreshInProgress: true },
    });
    if (locked.count === 0) {
      await prisma.refreshLog.update({
        where: { id: log.id },
        data: {
          status: "skipped",
          message: "Refresh already in progress",
          finishedAt: new Date(),
        },
      });
      return { feedId, articlesAdded: 0, notModified: true, error: "Refresh already in progress" };
    }

    const fetched = await fetchFeedContent(feed.url, {
      etag: feed.etag,
      lastModified: feed.lastModified,
    });

    if (!fetched.body) {
      await prisma.feed.update({
        where: { id: feedId },
        data: {
          refreshInProgress: false,
          lastFetchedAt: new Date(),
          lastError: null,
          etag: fetched.etag ?? feed.etag,
          lastModified: fetched.lastModified ?? feed.lastModified,
        },
      });
      await prisma.refreshLog.update({
        where: { id: log.id },
        data: {
          status: "not_modified",
          finishedAt: new Date(),
        },
      });
      return { feedId, articlesAdded: 0, notModified: true };
    }

    const added = await ingestFeedFromXml(feedId, fetched.body);
    await prisma.feed.update({
      where: { id: feedId },
      data: {
        refreshInProgress: false,
        lastFetchedAt: new Date(),
        lastError: null,
        etag: fetched.etag ?? feed.etag,
        lastModified: fetched.lastModified ?? feed.lastModified,
        url: normalizeHttpUrl(fetched.finalUrl).toString(),
      },
    });
    await prisma.refreshLog.update({
      where: { id: log.id },
      data: {
        status: "success",
        articlesAdded: added,
        finishedAt: new Date(),
      },
    });
    return { feedId, articlesAdded: added, notModified: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refresh failed";
    await prisma.feed.update({
      where: { id: feedId },
      data: {
        refreshInProgress: false,
        lastError: message,
        lastFetchedAt: new Date(),
      },
    });
    await prisma.refreshLog.update({
      where: { id: log.id },
      data: {
        status: "error",
        message,
        finishedAt: new Date(),
      },
    });
    return { feedId, articlesAdded: 0, notModified: false, error: message };
  }
}

export async function createFeedAndSubscription(input: {
  userId: string;
  feedUrl: string;
  folderId?: string | null;
  initialXml?: string;
}): Promise<{ feedId: string; subscriptionId: string }> {
  const normalizedUrl = normalizeHttpUrl(input.feedUrl).toString();
  await assertSafeFetchUrl(normalizedUrl);

  const existingFeed = await prisma.feed.findUnique({ where: { url: normalizedUrl } });
  if (existingFeed) {
    const subscription = await prisma.subscription.upsert({
      where: {
        userId_feedId: { userId: input.userId, feedId: existingFeed.id },
      },
      create: {
        userId: input.userId,
        feedId: existingFeed.id,
        folderId: input.folderId ?? null,
      },
      update: {
        folderId: input.folderId ?? undefined,
      },
    });
    return { feedId: existingFeed.id, subscriptionId: subscription.id };
  }

  let xml = input.initialXml;
  let title = "New Feed";
  let description: string | null = null;
  let siteUrl: string | null = null;

  if (!xml) {
    const fetched = await fetchFeedContent(normalizedUrl);
    xml = fetched.body;
  }

  const parsed = await parseFeedXml(xml);
  title = parsed.title;
  description = parsed.description;
  siteUrl = parsed.siteUrl;

  const feed = await prisma.feed.upsert({
    where: { url: normalizedUrl },
    create: {
      url: normalizedUrl,
      title,
      description,
      siteUrl,
      lastFetchedAt: new Date(),
    },
    update: {
      title,
      description,
      siteUrl,
    },
  });

  const subscription = await prisma.subscription.upsert({
    where: {
      userId_feedId: { userId: input.userId, feedId: feed.id },
    },
    create: {
      userId: input.userId,
      feedId: feed.id,
      folderId: input.folderId ?? null,
    },
    update: {
      folderId: input.folderId ?? undefined,
    },
  });

  await ingestFeedFromXml(feed.id, xml, { title, description, siteUrl });
  return { feedId: feed.id, subscriptionId: subscription.id };
}
