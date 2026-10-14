"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AddFeedDialog({
  open,
  onOpenChange,
  folders,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: Array<{ id: string; name: string }>;
  onAdded: () => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [folderId, setFolderId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (discover: boolean) => {
    setLoading(true);
    setError(null);
    try {
      let feedUrl = url.trim();
      if (discover) {
        const discoverRes = await fetch("/api/feeds/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: feedUrl }),
        });
        const discoverData = await discoverRes.json();
        if (!discoverRes.ok) throw new Error(discoverData.error ?? "Discovery failed");
        feedUrl = discoverData.feedUrl ?? feedUrl;
      }
      const res = await fetch("/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: feedUrl, folderId: folderId || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add feed");
      setUrl("");
      onOpenChange(false);
      await onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add feed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-5 shadow-xl">
          <Dialog.Title className="text-lg font-semibold">Add subscription</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            Paste a feed URL or website URL to discover its feed.
          </Dialog.Description>
          <div className="mt-4 space-y-3">
            <Input
              placeholder="https://example.com/feed.xml"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
            >
              <option value="">No folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button disabled={loading || !url.trim()} onClick={() => void submit(false)}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Add feed
              </Button>
              <Button disabled={loading || !url.trim()} variant="secondary" onClick={() => void submit(true)}>
                Discover & add
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
