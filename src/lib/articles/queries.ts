import { ARTICLES_PAGE_SIZE, DEFAULT_USER_ID } from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";

export type ArticleListFilter = "all" | "unread";
export type ArticleSort = "newest" | "oldest";

export interface ArticleListParams {
  userId?: string;
  feedId?: string;
  folderId?: string;
  subscriptionId?: string;
  filter?: ArticleListFilter;
  sort?: ArticleSort;
  cursor?: string;
  limit?: number;
  starred?: boolean;
  search?: string;
}

export interface ArticleListItem {
  id: string;
  feedId: string;
  title: string;
  author: string | null;
  summary: string | null;
  url: string | null;
  publishedAt: string | null;
  feedTitle: string;
  isRead: boolean;
  isStarred: boolean;
}

function subscriptionScope(userId: string) {
  return {
    feed: {
      subscriptions: {
        some: { userId },
      },
    },
  };
}

function buildWhere(params: ArticleListParams) {
  const userId = params.userId ?? DEFAULT_USER_ID;
  const and: object[] = [subscriptionScope(userId)];

  if (params.feedId) {
    and.push({ feedId: params.feedId });
  }

  if (params.folderId) {
    and.push({
      feed: {
        subscriptions: {
          some: { userId, folderId: params.folderId },
        },
      },
    });
  }

  if (params.subscriptionId) {
    and.push({
      feed: {
        subscriptions: {
          some: { userId, id: params.subscriptionId },
        },
      },
    });
  }

  if (params.starred) {
    and.push({
      states: { some: { userId, isStarred: true } },
    });
  }

  if (params.filter === "unread") {
    and.push({
      OR: [
        { states: { none: { userId } } },
        { states: { some: { userId, isRead: false } } },
      ],
    });
  }

  if (params.search?.trim()) {
    const q = params.search.trim();
    and.push({
      OR: [
        { title: { contains: q } },
        { summary: { contains: q } },
        { contentHtml: { contains: q } },
        { author: { contains: q } },
      ],
    });
  }

  return { AND: and };
}

/** Encodes `publishedAt` + `id` for stable keyset pagination. */
export function encodeArticleCursor(publishedAt: Date | null, id: string): string {
  const ts = publishedAt?.toISOString() ?? "";
  return `${ts}|${id}`;
}

function decodeArticleCursor(cursor: string): { publishedAt: Date | null; id: string } | null {
  const sep = cursor.lastIndexOf("|");
  if (sep <= 0) return null;
  const ts = cursor.slice(0, sep);
  const id = cursor.slice(sep + 1);
  if (!id) return null;
  if (!ts) return { publishedAt: null, id };
  const publishedAt = new Date(ts);
  if (Number.isNaN(publishedAt.getTime())) return null;
  return { publishedAt, id };
}

function cursorFilter(sort: ArticleSort, cursor: { publishedAt: Date | null; id: string }) {
  const { publishedAt, id } = cursor;
  if (sort === "newest") {
    if (publishedAt === null) {
      return { OR: [{ publishedAt: null, id: { lt: id } }] };
    }
    return {
      OR: [
        { publishedAt: { lt: publishedAt } },
        { AND: [{ publishedAt }, { id: { lt: id } }] },
        { publishedAt: null },
      ],
    };
  }
  if (publishedAt === null) {
    return {
      OR: [{ publishedAt: null, id: { gt: id } }, { publishedAt: { not: null } }],
    };
  }
  return {
    OR: [
      { publishedAt: { gt: publishedAt } },
      { AND: [{ publishedAt }, { id: { gt: id } }] },
    ],
  };
}

export async function listArticles(params: ArticleListParams) {
  const userId = params.userId ?? DEFAULT_USER_ID;
  const limit = params.limit ?? ARTICLES_PAGE_SIZE;
  const sort = params.sort ?? "newest";
  const decodedCursor = params.cursor ? decodeArticleCursor(params.cursor) : null;

  const whereParts: object[] = [buildWhere(params)];
  if (decodedCursor) {
    whereParts.push(cursorFilter(sort, decodedCursor));
  }

  const rows = await prisma.article.findMany({
    where: { AND: whereParts },
    orderBy: [
      { publishedAt: sort === "newest" ? "desc" : "asc" },
      { id: sort === "newest" ? "desc" : "asc" },
    ],
    take: limit + 1,
    include: {
      feed: { select: { title: true } },
      states: { where: { userId }, take: 1 },
    },
  });

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;

  const items: ArticleListItem[] = slice.map((row) => {
    const state = row.states[0];
    return {
      id: row.id,
      feedId: row.feedId,
      title: row.title,
      author: row.author,
      summary: row.summary,
      url: row.url,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      feedTitle: row.feed.title,
      isRead: state?.isRead ?? false,
      isStarred: state?.isStarred ?? false,
    };
  });

  const last = slice[slice.length - 1];
  const nextCursor =
    hasMore && last ? encodeArticleCursor(last.publishedAt, last.id) : null;

  return { items, nextCursor, hasMore };
}

export async function getArticleById(articleId: string, userId: string = DEFAULT_USER_ID) {
  const article = await prisma.article.findFirst({
    where: {
      id: articleId,
      feed: { subscriptions: { some: { userId } } },
    },
    include: {
      feed: { select: { title: true, siteUrl: true, url: true } },
      states: { where: { userId }, take: 1 },
    },
  });
  if (!article) return null;
  const state = article.states[0];
  return {
    ...article,
    feedTitle: article.feed.title,
    isRead: state?.isRead ?? false,
    isStarred: state?.isStarred ?? false,
  };
}

export async function articleExistsForUser(articleId: string, userId: string = DEFAULT_USER_ID) {
  const count = await prisma.article.count({
    where: {
      id: articleId,
      feed: { subscriptions: { some: { userId } } },
    },
  });
  return count > 0;
}
