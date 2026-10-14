"use client";

import { formatDistanceToNow } from "date-fns";
import {
  Loader2,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Star,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ArticleReaderPane } from "@/components/reader/article-reader-pane";
import { AddFeedDialog } from "@/components/reader/add-feed-dialog";
import { SettingsDialog } from "@/components/reader/settings-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ArticleListItem } from "@/lib/articles/queries";
import { cn } from "@/lib/utils";

export type SidebarSelection =
  | { type: "all" }
  | { type: "unread" }
  | { type: "starred" }
  | { type: "feed"; feedId: string }
  | { type: "folder"; folderId: string };

interface SubscriptionDto {
  id: string;
  feedId: string;
  title: string;
  folderId: string | null;
  unreadCount: number;
}

interface FolderDto {
  id: string;
  name: string;
  subscriptions: SubscriptionDto[];
  unreadCount: number;
}

interface SidebarDto {
  folders: FolderDto[];
  rootSubscriptions: SubscriptionDto[];
  counts: { all: number; unread: number; starred: number };
}

export function ReaderApp() {
  const { theme, setTheme } = useTheme();
  const [sidebar, setSidebar] = useState<SidebarDto | null>(null);
  const [selection, setSelection] = useState<SidebarSelection>({ type: "unread" });
  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unread">("unread");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("sort", sort);
    params.set("filter", selection.type === "starred" ? "all" : filter);
    if (selection.type === "feed") params.set("feedId", selection.feedId);
    if (selection.type === "folder") params.set("folderId", selection.folderId);
    if (selection.type === "unread") params.set("filter", "unread");
    if (selection.type === "starred") params.set("starred", "true");
    if (search.trim()) params.set("search", search.trim());
    return params;
  }, [selection, filter, sort, search]);

  const loadSidebar = useCallback(async () => {
    const res = await fetch("/api/subscriptions");
    if (!res.ok) throw new Error("Failed to load subscriptions");
    setSidebar(await res.json());
  }, []);

  const loadArticles = useCallback(
    async (opts?: { append?: boolean; cursor?: string | null }) => {
      const append = opts?.append ?? false;
      const nextCursor = opts?.cursor ?? null;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams(queryParams);
        if (nextCursor) params.set("cursor", nextCursor);
        const res = await fetch(`/api/articles?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load articles");
        const data = await res.json();
        setArticles((prev) => (append ? [...prev, ...data.items] : data.items));
        setCursor(data.nextCursor);
        setHasMore(data.hasMore);
        if (!append) {
          setSelectedArticleId((current) => {
            if (current && data.items.some((a: ArticleListItem) => a.id === current)) {
              return current;
            }
            return data.items[0]?.id ?? null;
          });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load articles");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [queryParams],
  );

  useEffect(() => {
    void loadSidebar().catch(() => setError("Failed to load sidebar"));
  }, [loadSidebar]);

  useEffect(() => {
    void loadArticles();
  }, [loadArticles]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      const index = articles.findIndex((a) => a.id === selectedArticleId);
      if (event.key === "j" && index < articles.length - 1) {
        setSelectedArticleId(articles[index + 1].id);
      }
      if (event.key === "k" && index > 0) {
        setSelectedArticleId(articles[index - 1].id);
      }
      if (event.key === "/" ) {
        event.preventDefault();
        document.getElementById("reader-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [articles, selectedArticleId]);

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await fetch("/api/feeds/refresh-all", { method: "POST" });
      await loadSidebar();
      await loadArticles();
    } finally {
      setRefreshing(false);
    }
  };

  const patchArticle = async (articleId: string, patch: { isRead?: boolean; isStarred?: boolean }) => {
    await fetch(`/api/articles/${articleId}/state`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setArticles((prev) =>
      prev.map((a) =>
        a.id === articleId
          ? {
              ...a,
              isRead: patch.isRead ?? a.isRead,
              isStarred: patch.isStarred ?? a.isStarred,
            }
          : a,
      ),
    );
    void loadSidebar();
  };

  const onScroll = () => {
    const el = listRef.current;
    if (!el || loadingMore || !hasMore || !cursor) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) {
      void loadArticles({ append: true, cursor });
    }
  };

  const selectedArticle = articles.find((a) => a.id === selectedArticleId) ?? null;

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-muted/30">
        <div className="flex items-center justify-between border-b border-border px-3 py-3">
          <h1 className="text-sm font-semibold tracking-tight">Reader</h1>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Toggle theme"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="ghost" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <nav className="space-y-1 p-2 text-sm">
            <SidebarItem
              label="All items"
              count={sidebar?.counts.all}
              active={selection.type === "all"}
              onClick={() => setSelection({ type: "all" })}
            />
            <SidebarItem
              label="Unread"
              count={sidebar?.counts.unread}
              active={selection.type === "unread"}
              onClick={() => setSelection({ type: "unread" })}
            />
            <SidebarItem
              label="Starred"
              count={sidebar?.counts.starred}
              active={selection.type === "starred"}
              onClick={() => setSelection({ type: "starred" })}
            />
            {sidebar?.folders.map((folder) => (
              <div key={folder.id} className="pt-2">
                <SidebarItem
                  label={folder.name}
                  count={folder.unreadCount}
                  active={selection.type === "folder" && selection.folderId === folder.id}
                  onClick={() => setSelection({ type: "folder", folderId: folder.id })}
                  muted
                />
                {folder.subscriptions.map((sub) => (
                  <SidebarItem
                    key={sub.id}
                    label={sub.title}
                    count={sub.unreadCount}
                    active={selection.type === "feed" && selection.feedId === sub.feedId}
                    onClick={() => setSelection({ type: "feed", feedId: sub.feedId })}
                    nested
                  />
                ))}
              </div>
            ))}
            {sidebar?.rootSubscriptions.map((sub) => (
              <SidebarItem
                key={sub.id}
                label={sub.title}
                count={sub.unreadCount}
                active={selection.type === "feed" && selection.feedId === sub.feedId}
                onClick={() => setSelection({ type: "feed", feedId: sub.feedId })}
                nested
              />
            ))}
          </nav>
        </ScrollArea>
        <div className="space-y-2 border-t border-border p-2">
          <Button className="w-full" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add subscription
          </Button>
          <Button className="w-full" size="sm" variant="secondary" disabled={refreshing} onClick={() => void refreshAll()}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh all
          </Button>
        </div>
      </aside>

      <section className="flex w-[22rem] shrink-0 flex-col border-r border-border md:w-[26rem]">
        <div className="space-y-2 border-b border-border p-3">
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput);
            }}
          >
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="reader-search"
              className="pl-8"
              placeholder="Search articles (Enter)"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </form>
          <div className="flex gap-2">
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={filter}
              onChange={(e) => setFilter(e.target.value as "all" | "unread")}
              disabled={selection.type === "unread" || selection.type === "starred"}
            >
              <option value="all">All</option>
              <option value="unread">Unread</option>
            </select>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={sort}
              onChange={(e) => setSort(e.target.value as "newest" | "oldest")}
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
            </select>
          </div>
        </div>
        <div ref={listRef} className="flex-1 overflow-y-auto" onScroll={onScroll}>
          {loading && (
            <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading articles…
            </div>
          )}
          {!loading && error && (
            <div className="p-4 text-sm text-destructive">{error}</div>
          )}
          {!loading && !error && articles.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground">No articles in this view.</div>
          )}
          {articles.map((article) => (
            <button
              key={article.id}
              type="button"
              className={cn(
                "w-full border-b border-border px-3 py-3 text-left transition hover:bg-accent/50",
                selectedArticleId === article.id && "bg-accent",
                !article.isRead && "font-medium",
              )}
              onClick={() => setSelectedArticleId(article.id)}
            >
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    article.isRead ? "bg-transparent" : "bg-primary",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <p className="line-clamp-2 text-sm">{article.title}</p>
                    {article.isStarred && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {article.feedTitle}
                    {article.publishedAt
                      ? ` · ${formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}`
                      : ""}
                  </p>
                  {article.summary && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{article.summary}</p>
                  )}
                </div>
              </div>
            </button>
          ))}
          {loadingMore && (
            <div className="flex justify-center p-4 text-xs text-muted-foreground">
              <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Loading more…
            </div>
          )}
        </div>
      </section>

      <main className="min-w-0 flex-1">
        <ArticleReaderPane
          articleId={selectedArticleId}
          listItem={selectedArticle}
          onToggleRead={(isRead) => selectedArticleId && void patchArticle(selectedArticleId, { isRead })}
          onToggleStar={(isStarred) => selectedArticleId && void patchArticle(selectedArticleId, { isStarred })}
        />
      </main>

      <AddFeedDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        folders={sidebar?.folders ?? []}
        onAdded={async () => {
          await loadSidebar();
          await loadArticles();
        }}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

function SidebarItem({
  label,
  count,
  active,
  onClick,
  nested,
  muted,
}: {
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
  nested?: boolean;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition hover:bg-accent",
        active && "bg-accent text-accent-foreground",
        nested && "pl-5 text-[13px]",
        muted && "text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="truncate">{label}</span>
      {typeof count === "number" && count > 0 && !muted && (
        <span className="ml-2 shrink-0 rounded-full bg-primary/10 px-1.5 text-[11px] text-primary">
          {count}
        </span>
      )}
    </button>
  );
}
