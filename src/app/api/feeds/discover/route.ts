import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api/response";
import { discoverFeedUrl } from "@/lib/feeds/discovery";

const schema = z.object({ url: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return jsonError("Invalid request body");
  const feedUrl = await discoverFeedUrl(parsed.data.url);
  if (!feedUrl) return jsonError("No feed discovered at this URL", 404);
  return jsonOk({ feedUrl });
}
