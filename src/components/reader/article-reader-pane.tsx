"use client";

import { format } from "date-fns";
import { ExternalLink, Loader2, Star } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ArticleListItem } from "@/lib/articles/queries";

interface ArticleDetail extends ArticleListItem {
  contentHtml: string | null;
  feed: { title: string; siteUrl: string | null; url: string };
  sanitizedHtml: string;
}

export function ArticleReaderPane({
  articleId,
  listItem,
  onToggleRead,
  onToggleStar,
}: {
  articleId: string | null;
  listItem: ArticleListItem | null;
  onToggleRead: (isRead: boolean) => void;
  onToggleStar: (isStarred: boolean) => void;
}) {
  const [detail, setDetail] = useState<ArticleDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!articleId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    setError(null);
    void fetch(`/api/articles/${articleId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load article");
        setDetail(await res.json());
        if (listItem && !listItem.isRead) onToggleRead(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mark read once when opening
  }, [articleId]);

  if (!articleId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select an article to read
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading article…
      </div>
    );
  }

  if (error || !detail) {
    return <div className="p-6 text-sm text-destructive">{error ?? "Article not found"}</div>;
  }

  return (
    <article className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold leading-snug">{detail.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {detail.feed.title}
              {detail.author ? ` · ${detail.author}` : ""}
              {detail.publishedAt ? ` · ${format(new Date(detail.publishedAt), "PPP p")}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant={detail.isStarred ? "default" : "outline"}
              onClick={() => {
                const next = !detail.isStarred;
                setDetail({ ...detail, isStarred: next });
                onToggleStar(next);
              }}
            >
              <Star className={detail.isStarred ? "h-4 w-4 fill-current" : "h-4 w-4"} />
              {detail.isStarred ? "Starred" : "Star"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const next = !detail.isRead;
                setDetail({ ...detail, isRead: next });
                onToggleRead(next);
              }}
            >
              {detail.isRead ? "Mark unread" : "Mark read"}
            </Button>
            {detail.url && (
              <Button size="sm" variant="secondary" asChild>
                <a href={detail.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" /> Original
                </a>
              </Button>
            )}
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {detail.sanitizedHtml ? (
          <div
            className="prose prose-sm dark:prose-invert max-w-none prose-img:rounded-md prose-a:text-primary"
            dangerouslySetInnerHTML={{ __html: detail.sanitizedHtml }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{detail.summary ?? "No content available."}</p>
        )}
      </div>
    </article>
  );
}
