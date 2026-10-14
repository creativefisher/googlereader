import { XMLParser } from "fast-xml-parser";

import {
  OPML_IMPORT_CONCURRENCY,
  OPML_MAX_FEED_IMPORTS,
  OPML_MAX_OUTLINE_VISITS,
} from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";
import { createFeedAndSubscription } from "@/lib/feeds/ingestion";
import { normalizeHttpUrl } from "@/lib/security/url";

export interface OpmlOutline {
  text?: string;
  title?: string;
  xmlUrl?: string;
  type?: string;
  outlines?: OpmlOutline | OpmlOutline[];
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function childOutlines(outline: OpmlOutline): OpmlOutline[] {
  return asArray(outline.outlines ?? (outline as OpmlOutline & { outline?: OpmlOutline | OpmlOutline[] }).outline);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function exportSubscriptionsOpml(userId: string): Promise<string> {
  const folders = await prisma.folder.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
    include: {
      subscriptions: {
        orderBy: { sortOrder: "asc" },
        include: { feed: true },
      },
    },
  });
  const rootSubs = await prisma.subscription.findMany({
    where: { userId, folderId: null },
    orderBy: { sortOrder: "asc" },
    include: { feed: true },
  });

  const folderXml = folders
    .map((folder) => {
      const subs = folder.subscriptions
        .map(
          (sub) =>
            `      <outline type="rss" text="${escapeXml(sub.customTitle ?? sub.feed.title)}" xmlUrl="${escapeXml(sub.feed.url)}" htmlUrl="${escapeXml(sub.feed.siteUrl ?? sub.feed.url)}"/>`,
        )
        .join("\n");
      return `    <outline text="${escapeXml(folder.name)}" title="${escapeXml(folder.name)}">\n${subs}\n    </outline>`;
    })
    .join("\n");

  const rootXml = rootSubs
    .map(
      (sub) =>
        `    <outline type="rss" text="${escapeXml(sub.customTitle ?? sub.feed.title)}" xmlUrl="${escapeXml(sub.feed.url)}" htmlUrl="${escapeXml(sub.feed.siteUrl ?? sub.feed.url)}"/>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Subscriptions</title>
  </head>
  <body>
${folderXml}
${rootXml}
  </body>
</opml>`;
}

export interface OpmlImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

interface PendingFeedJob {
  feedUrl: string;
  folderName: string | null;
}

interface CollectState {
  visits: number;
  truncated: boolean;
}

function collectFeedJobs(
  outlines: OpmlOutline[],
  folderName: string | null,
  jobs: PendingFeedJob[],
  state: CollectState,
): void {
  if (state.truncated) return;

  for (const outline of outlines) {
    if (state.visits >= OPML_MAX_OUTLINE_VISITS) {
      state.truncated = true;
      return;
    }
    state.visits += 1;

    const nested = childOutlines(outline);
    const xmlUrl = outline.xmlUrl?.trim();
    if (xmlUrl && outline.type !== "folder") {
      jobs.push({ feedUrl: xmlUrl, folderName });
      continue;
    }

    if (nested.length > 0) {
      const nestedFolderName = outline.title ?? outline.text ?? "Imported folder";
      collectFeedJobs(nested, nestedFolderName, jobs, state);
    }
  }
}

function dedupeJobsByNormalizedUrl(jobs: PendingFeedJob[]): PendingFeedJob[] {
  const byUrl = new Map<string, PendingFeedJob>();
  for (const job of jobs) {
    try {
      const normalized = normalizeHttpUrl(job.feedUrl).toString();
      if (!byUrl.has(normalized)) {
        byUrl.set(normalized, { feedUrl: normalized, folderName: job.folderName });
      }
    } catch {
      // skip invalid URLs during collection dedupe
    }
  }
  return [...byUrl.values()];
}

async function resolveFolderIds(userId: string, folderNames: Iterable<string>) {
  const folderIds = new Map<string, string>();
  for (const name of folderNames) {
    const folder = await prisma.folder.upsert({
      where: { userId_name: { userId, name } },
      create: { userId, name },
      update: {},
    });
    folderIds.set(name, folder.id);
  }
  return folderIds;
}

export async function importSubscriptionsOpml(userId: string, opml: string): Promise<OpmlImportResult> {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const parsed = parser.parse(opml);
  const body = parsed?.opml?.body;
  const outlines = asArray<OpmlOutline>(body?.outline);

  const existing = await prisma.subscription.findMany({
    where: { userId },
    include: { feed: true },
  });
  const existingUrls = new Set(existing.map((s) => s.feed.url));

  const collectState: CollectState = { visits: 0, truncated: false };
  const rawJobs: PendingFeedJob[] = [];
  collectFeedJobs(outlines, null, rawJobs, collectState);

  const uniqueJobs = dedupeJobsByNormalizedUrl(rawJobs);
  const capped = uniqueJobs.slice(0, OPML_MAX_FEED_IMPORTS);

  const result: OpmlImportResult = { imported: 0, skipped: 0, errors: [] };
  if (uniqueJobs.length > OPML_MAX_FEED_IMPORTS) {
    result.errors.push(`OPML import capped at ${OPML_MAX_FEED_IMPORTS} feeds`);
  }
  if (collectState.truncated) {
    result.errors.push(`OPML outline traversal capped at ${OPML_MAX_OUTLINE_VISITS} nodes`);
  }

  const folderNames = new Set(
    capped.map((job) => job.folderName).filter((name): name is string => Boolean(name)),
  );
  const folderIds = await resolveFolderIds(userId, folderNames);

  for (let i = 0; i < capped.length; i += OPML_IMPORT_CONCURRENCY) {
    const batch = capped.slice(i, i + OPML_IMPORT_CONCURRENCY);
    await Promise.all(
      batch.map(async (job) => {
        try {
          if (existingUrls.has(job.feedUrl)) {
            result.skipped += 1;
            return;
          }
          const folderId = job.folderName ? (folderIds.get(job.folderName) ?? null) : null;
          await createFeedAndSubscription({
            userId,
            feedUrl: job.feedUrl,
            folderId,
          });
          existingUrls.add(job.feedUrl);
          result.imported += 1;
        } catch (error) {
          result.errors.push(error instanceof Error ? error.message : "Import failed");
        }
      }),
    );
  }

  return result;
}
