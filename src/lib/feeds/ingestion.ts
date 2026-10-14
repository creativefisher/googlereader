import { REFRESH_STALE_LOCK_MS } from "@/lib/constants";
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

async function resolveFeedUrlUpdate(feedId: string, currentUrl: string, finalUrl: string) {
  const normalizedFinal = normalizeHttpUrl(finalUrl).toString();
  if (normalizedFinal === currentUrl) return {};
  const conflict = await prisma.feed.findFirst({
    where: { url: normalizedFinal, NOT: { id: feedId } },
    select: { id: true },
  });
  if (conflict) return {};
  return { url: normalizedFinal };
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
      where: {
        feedId_fingerprint: { feedId, fingerprint: article.fingerprint },
      },
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

async function acquireRefreshLock(feedId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - REFRESH_STALE_LOCK_MS);
  const locked = await prisma.feed.updateMany({
    where: {
      id: feedId,
      OR: [
        { refreshInProgress: false },
        {
          refreshInProgress: true,
          OR: [
            { refreshStartedAt: { lt: staleBefore } },
            { refreshStartedAt: null, updatedAt: { lt: staleBefore } },
          ],
        },
      ],
    },
    data: {
      refreshInProgress: true,
      refreshStartedAt: new Date(),
    },
  });
  return locked.count > 0;
}

function releaseRefreshLock(feedId: string) {
  return prisma.feed.update({
    where: { id: feedId },
    data: { refreshInProgress: false, refreshStartedAt: null },
  });
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
    const acquired = await acquireRefreshLock(feedId);
    if (!acquired) {
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

    const urlPatch = await resolveFeedUrlUpdate(feedId, feed.url, fetched.finalUrl);

    if (!fetched.body) {
      await prisma.feed.update({
        where: { id: feedId },
        data: {
          refreshInProgress: false,
          refreshStartedAt: null,
          lastFetchedAt: new Date(),
          lastError: null,
          etag: fetched.etag ?? feed.etag,
          lastModified: fetched.lastModified ?? feed.lastModified,
          ...urlPatch,
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
        refreshStartedAt: null,
        lastFetchedAt: new Date(),
        lastError: null,
        etag: fetched.etag ?? feed.etag,
        lastModified: fetched.lastModified ?? feed.lastModified,
        ...urlPatch,
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
    await releaseRefreshLock(feedId);
    await prisma.feed.update({
      where: { id: feedId },
      data: {
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
