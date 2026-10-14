import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api/response";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { ensureDefaultUser } from "@/lib/db/user";
import { createFeedAndSubscription } from "@/lib/feeds/ingestion";
import { prisma } from "@/lib/db/prisma";

const createSchema = z.object({
  url: z.string().min(1),
  folderId: z.string().nullable().optional(),
});

export async function GET() {
  await ensureDefaultUser();
  const feeds = await prisma.feed.findMany({
    orderBy: { title: "asc" },
    include: {
      subscriptions: { where: { userId: DEFAULT_USER_ID } },
      _count: { select: { articles: true } },
    },
  });
  return jsonOk({ feeds });
}

export async function POST(request: Request) {
  await ensureDefaultUser();
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError("Invalid request body");
  try {
    const result = await createFeedAndSubscription({
      userId: DEFAULT_USER_ID,
      feedUrl: parsed.data.url,
      folderId: parsed.data.folderId ?? null,
    });
    return jsonOk(result, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Failed to add feed", 400);
  }
}
