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

function buildWhere(params: ArticleListParams) {
  const userId = params.userId ?? DEFAULT_USER_ID;
  const and: object[] = [];

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

  return and.length > 0 ? { AND: and } : {};
}

export async function listArticles(params: ArticleListParams) {
  const userId = params.userId ?? DEFAULT_USER_ID;
  const limit = params.limit ?? ARTICLES_PAGE_SIZE;
  const sort = params.sort ?? "newest";
  const cursorDate = params.cursor ? new Date(params.cursor) : null;

  const where = buildWhere(params);
  const dateFilter =
    cursorDate && !Number.isNaN(cursorDate.getTime())
      ? {
          publishedAt:
            sort === "newest"
              ? { lt: cursorDate }
              : { gt: cursorDate },
        }
      : {};

  const rows = await prisma.article.findMany({
    where: { ...where, ...dateFilter },
    orderBy: { publishedAt: sort === "newest" ? "desc" : "asc" },
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

  const nextCursor =
    hasMore && slice.length > 0
      ? slice[slice.length - 1].publishedAt?.toISOString() ?? null
      : null;

  return { items, nextCursor, hasMore };
}

export async function getArticleById(articleId: string, userId: string = DEFAULT_USER_ID) {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
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
