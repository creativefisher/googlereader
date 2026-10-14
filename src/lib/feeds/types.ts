export interface NormalizedArticle {
  guid: string | null;
  url: string | null;
  title: string;
  author: string | null;
  summary: string | null;
  contentHtml: string | null;
  publishedAt: Date | null;
  fingerprint: string;
}

export interface NormalizedFeed {
  title: string;
  description: string | null;
  siteUrl: string | null;
  articles: NormalizedArticle[];
}

export interface FetchFeedResult {
  body: string;
  etag: string | null;
  lastModified: string | null;
  finalUrl: string;
}
