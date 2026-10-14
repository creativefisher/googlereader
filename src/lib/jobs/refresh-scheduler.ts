import { DEFAULT_USER_ID } from "@/lib/constants";
import { getRefreshIntervalMinutes } from "@/lib/db/user";
import { refreshFeedById } from "@/lib/feeds/ingestion";
import { prisma } from "@/lib/db/prisma";

let schedulerStarted = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let tickInProgress = false;

export async function refreshAllFeeds(): Promise<{ refreshed: number; errors: number }> {
  const feeds = await prisma.feed.findMany({ select: { id: true } });
  let refreshed = 0;
  let errors = 0;
  for (const feed of feeds) {
    const result = await refreshFeedById(feed.id);
    if (result.error && result.articlesAdded === 0 && !result.notModified) {
      errors += 1;
    } else {
      refreshed += 1;
    }
  }
  return { refreshed, errors };
}

async function schedulerTick() {
  if (tickInProgress) return;
  tickInProgress = true;
  try {
    await refreshAllFeeds();
  } finally {
    tickInProgress = false;
  }
}

/**
 * Simple in-process scheduler for local development.
 *
 * Limitations:
 * - Runs only while the Next.js Node.js server process is alive.
 * - Intervals reset on hot reload and do not run during `next build`.
 * - Multiple server instances would each run their own scheduler (not safe for production).
 *
 * Production approach: use a dedicated worker/cron (e.g. Vercel Cron, GitHub Actions,
 * or a queue consumer) calling POST /api/feeds/refresh-all with auth.
 */
export function startRefreshScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  void (async () => {
    const minutes = await getRefreshIntervalMinutes();
    const ms = Math.max(1, minutes) * 60_000;
    intervalHandle = setInterval(() => {
      void schedulerTick();
    }, ms);
  })();
}

export function stopRefreshScheduler() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
  schedulerStarted = false;
}

export async function updateRefreshInterval(minutes: number) {
  await prisma.userSettings.upsert({
    where: { userId: DEFAULT_USER_ID },
    create: { userId: DEFAULT_USER_ID, refreshIntervalMinutes: minutes },
    update: { refreshIntervalMinutes: minutes },
  });
  stopRefreshScheduler();
  schedulerStarted = false;
  startRefreshScheduler();
}
