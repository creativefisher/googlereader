"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [interval, setIntervalMinutes] = useState("30");
  const [folderName, setFolderName] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => setIntervalMinutes(String(data.refreshIntervalMinutes ?? 30)));
  }, [open]);

  const saveSettings = async () => {
    const minutes = Number(interval);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshIntervalMinutes: minutes }),
    });
    setMessage(res.ok ? "Settings saved" : "Failed to save settings");
  };

  const createFolder = async () => {
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: folderName }),
    });
    setMessage(res.ok ? "Folder created" : "Failed to create folder");
    setFolderName("");
  };

  const exportOpml = async () => {
    const res = await fetch("/api/opml/export");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "subscriptions.opml";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importOpml = async (file: File) => {
    const text = await file.text();
    const res = await fetch("/api/opml/import", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: text,
    });
    const data = await res.json();
    setMessage(res.ok ? `Imported ${data.imported} feeds` : data.error ?? "Import failed");
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 max-h-[85vh] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-background p-5 shadow-xl">
          <Dialog.Title className="text-lg font-semibold">Settings</Dialog.Title>
          <div className="mt-4 space-y-5 text-sm">
            <section className="space-y-2">
              <h3 className="font-medium">Background refresh</h3>
              <p className="text-muted-foreground">
                Automatic refresh interval (minutes). The in-process scheduler is suitable for local development only.
              </p>
              <div className="flex gap-2">
                <Input value={interval} onChange={(e) => setIntervalMinutes(e.target.value)} />
                <Button onClick={() => void saveSettings()}>Save</Button>
              </div>
            </section>
            <section className="space-y-2">
              <h3 className="font-medium">Folders</h3>
              <div className="flex gap-2">
                <Input
                  placeholder="New folder name"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                />
                <Button variant="secondary" onClick={() => void createFolder()}>
                  Create
                </Button>
              </div>
            </section>
            <section className="space-y-2">
              <h3 className="font-medium">OPML</h3>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => void exportOpml()}>
                  Export subscriptions
                </Button>
                <label className="inline-flex cursor-pointer items-center rounded-md border border-input px-3 py-2 text-sm hover:bg-accent">
                  Import OPML
                  <input
                    type="file"
                    accept=".opml,.xml,text/xml"
                    className="hidden"
                    onChange={(e) => {
                      const input = e.target;
                      const file = input.files?.[0];
                      input.value = "";
                      if (file) void importOpml(file);
                    }}
                  />
                </label>
              </div>
            </section>
            {message && <p className="text-muted-foreground">{message}</p>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
