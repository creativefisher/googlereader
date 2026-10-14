import { DEFAULT_USER_ID } from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";

export async function markArticleRead(userId: string, articleId: string, isRead: boolean) {
  return prisma.articleState.upsert({
    where: { userId_articleId: { userId, articleId } },
    create: {
      userId,
      articleId,
      isRead,
      readAt: isRead ? new Date() : null,
    },
    update: {
      isRead,
      readAt: isRead ? new Date() : null,
    },
  });
}

export async function markArticleStarred(userId: string, articleId: string, isStarred: boolean) {
  return prisma.articleState.upsert({
    where: { userId_articleId: { userId, articleId } },
    create: { userId, articleId, isStarred },
    update: { isStarred },
  });
}

export async function bulkMarkRead(userId: string, articleIds: string[]) {
  if (articleIds.length === 0) return { count: 0 };
  const now = new Date();
  await prisma.$transaction(
    articleIds.map((articleId) =>
      prisma.articleState.upsert({
        where: { userId_articleId: { userId, articleId } },
        create: { userId, articleId, isRead: true, readAt: now },
        update: { isRead: true, readAt: now },
      }),
    ),
  );
  return { count: articleIds.length };
}

export async function bulkMarkReadInFeed(userId: string, feedId: string) {
  const articles = await prisma.article.findMany({
    where: { feedId },
    select: { id: true },
  });
  return bulkMarkRead(
    userId,
    articles.map((a) => a.id),
  );
}

export async function getUnreadCountForUser(userId: string = DEFAULT_USER_ID): Promise<number> {
  const totalArticles = await prisma.article.count();
  const readArticles = await prisma.articleState.count({
    where: { userId, isRead: true },
  });
  return Math.max(0, totalArticles - readArticles);
}

export async function getUnreadCountByFeed(userId: string): Promise<Record<string, number>> {
  const feeds = await prisma.feed.findMany({ select: { id: true } });
  const result: Record<string, number> = {};
  for (const feed of feeds) {
    const total = await prisma.article.count({ where: { feedId: feed.id } });
    const read = await prisma.articleState.count({
      where: { userId, isRead: true, article: { feedId: feed.id } },
    });
    result[feed.id] = Math.max(0, total - read);
  }
  return result;
}
