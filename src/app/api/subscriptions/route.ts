import { jsonOk } from "@/lib/api/response";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { ensureDefaultUser } from "@/lib/db/user";
import { listFoldersWithSubscriptions } from "@/lib/folders/management";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  await ensureDefaultUser();
  const userId = DEFAULT_USER_ID;

  const subscriptions = await prisma.subscription.findMany({
    where: { userId },
    select: { id: true, feedId: true, folderId: true, customTitle: true, sortOrder: true, feed: true },
    orderBy: { sortOrder: "asc" },
  });
  const feedIds = [...new Set(subscriptions.map((s) => s.feedId))];

  const [articleCounts, readStates, starredCount] = await Promise.all([
    feedIds.length
      ? prisma.article.groupBy({
          by: ["feedId"],
          where: { feedId: { in: feedIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    feedIds.length
      ? prisma.articleState.findMany({
          where: { userId, isRead: true, article: { feedId: { in: feedIds } } },
          select: { article: { select: { feedId: true } } },
        })
      : Promise.resolve([]),
    prisma.articleState.count({
      where: {
        userId,
        isStarred: true,
        article: { feedId: { in: feedIds } },
      },
    }),
  ]);

  const totalByFeed = new Map(articleCounts.map((row) => [row.feedId, row._count._all]));
  const readByFeed = new Map<string, number>();
  for (const state of readStates) {
    const fid = state.article.feedId;
    readByFeed.set(fid, (readByFeed.get(fid) ?? 0) + 1);
  }

  const unreadForFeed = (feedId: string) => {
    const total = totalByFeed.get(feedId) ?? 0;
    const read = readByFeed.get(feedId) ?? 0;
    return Math.max(0, total - read);
  };

  const foldersRaw = await listFoldersWithSubscriptions(userId);
  const folders = foldersRaw.map((folder) => {
    const subs = folder.subscriptions.map((sub) => ({
      id: sub.id,
      feedId: sub.feedId,
      title: sub.customTitle ?? sub.feed.title,
      folderId: sub.folderId,
      unreadCount: unreadForFeed(sub.feedId),
    }));
    return {
      id: folder.id,
      name: folder.name,
      subscriptions: subs,
      unreadCount: subs.reduce((sum, s) => sum + s.unreadCount, 0),
    };
  });

  const rootSubscriptions = subscriptions
    .filter((sub) => sub.folderId === null)
    .map((sub) => ({
      id: sub.id,
      feedId: sub.feedId,
      title: sub.customTitle ?? sub.feed.title,
      folderId: sub.folderId,
      unreadCount: unreadForFeed(sub.feedId),
    }));

  const totalArticles = [...totalByFeed.values()].reduce((a, b) => a + b, 0);
  const readArticles = [...readByFeed.values()].reduce((a, b) => a + b, 0);

  return jsonOk({
    folders,
    rootSubscriptions,
    counts: {
      all: totalArticles,
      unread: Math.max(0, totalArticles - readArticles),
      starred: starredCount,
    },
  });
}
