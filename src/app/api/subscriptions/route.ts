import { jsonOk } from "@/lib/api/response";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { ensureDefaultUser } from "@/lib/db/user";
import { listFoldersWithSubscriptions } from "@/lib/folders/management";
import { prisma } from "@/lib/db/prisma";

async function unreadForFeed(userId: string, feedId: string) {
  const total = await prisma.article.count({ where: { feedId } });
  const read = await prisma.articleState.count({
    where: { userId, isRead: true, article: { feedId } },
  });
  return Math.max(0, total - read);
}

export async function GET() {
  await ensureDefaultUser();
  const userId = DEFAULT_USER_ID;
  const foldersRaw = await listFoldersWithSubscriptions(userId);
  const rootSubscriptionsRaw = await prisma.subscription.findMany({
    where: { userId, folderId: null },
    include: { feed: true },
    orderBy: { sortOrder: "asc" },
  });

  const folders = await Promise.all(
    foldersRaw.map(async (folder) => {
      const subscriptions = await Promise.all(
        folder.subscriptions.map(async (sub) => ({
          id: sub.id,
          feedId: sub.feedId,
          title: sub.customTitle ?? sub.feed.title,
          folderId: sub.folderId,
          unreadCount: await unreadForFeed(userId, sub.feedId),
        })),
      );
      const unreadCount = subscriptions.reduce((sum, s) => sum + s.unreadCount, 0);
      return { id: folder.id, name: folder.name, subscriptions, unreadCount };
    }),
  );

  const rootSubscriptions = await Promise.all(
    rootSubscriptionsRaw.map(async (sub) => ({
      id: sub.id,
      feedId: sub.feedId,
      title: sub.customTitle ?? sub.feed.title,
      folderId: sub.folderId,
      unreadCount: await unreadForFeed(userId, sub.feedId),
    })),
  );

  const totalArticles = await prisma.article.count();
  const readArticles = await prisma.articleState.count({ where: { userId, isRead: true } });
  const starred = await prisma.articleState.count({ where: { userId, isStarred: true } });

  return jsonOk({
    folders,
    rootSubscriptions,
    counts: {
      all: totalArticles,
      unread: Math.max(0, totalArticles - readArticles),
      starred,
    },
  });
}
