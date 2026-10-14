import { XMLParser } from "fast-xml-parser";

import { OPML_IMPORT_CONCURRENCY, OPML_MAX_FEED_IMPORTS } from "@/lib/constants";
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

interface FeedImportJob {
  feedUrl: string;
  folderId: string | null;
}

async function collectFeedJobs(
  userId: string,
  outlines: OpmlOutline[],
  folderId: string | null,
  jobs: FeedImportJob[],
): Promise<void> {
  for (const outline of outlines) {
    const nested = childOutlines(outline);
    const xmlUrl = outline.xmlUrl?.trim();
    if (xmlUrl && outline.type !== "folder") {
      jobs.push({ feedUrl: xmlUrl, folderId });
      continue;
    }
    if (nested.length > 0) {
      const folderName = outline.title ?? outline.text ?? "Imported folder";
      const folder = await prisma.folder.upsert({
        where: { userId_name: { userId, name: folderName } },
        create: { userId, name: folderName },
        update: {},
      });
      await collectFeedJobs(userId, nested, folder.id, jobs);
    }
  }
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

  const jobs: FeedImportJob[] = [];
  await collectFeedJobs(userId, outlines, null, jobs);

  const result: OpmlImportResult = { imported: 0, skipped: 0, errors: [] };
  const capped = jobs.slice(0, OPML_MAX_FEED_IMPORTS);
  if (jobs.length > OPML_MAX_FEED_IMPORTS) {
    result.errors.push(`OPML import capped at ${OPML_MAX_FEED_IMPORTS} feeds`);
  }

  for (let i = 0; i < capped.length; i += OPML_IMPORT_CONCURRENCY) {
    const batch = capped.slice(i, i + OPML_IMPORT_CONCURRENCY);
    await Promise.all(
      batch.map(async (job) => {
        try {
          const normalized = normalizeHttpUrl(job.feedUrl).toString();
          if (existingUrls.has(normalized)) {
            result.skipped += 1;
            return;
          }
          await createFeedAndSubscription({
            userId,
            feedUrl: normalized,
            folderId: job.folderId,
          });
          existingUrls.add(normalized);
          result.imported += 1;
        } catch (error) {
          result.errors.push(error instanceof Error ? error.message : "Import failed");
        }
      }),
    );
  }

  return result;
}
