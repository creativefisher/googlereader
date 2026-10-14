import { jsonError, jsonOk } from "@/lib/api/response";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { ensureDefaultUser } from "@/lib/db/user";
import { importSubscriptionsOpml } from "@/lib/opml/import-export";

export async function POST(request: Request) {
  await ensureDefaultUser();
  const opml = await request.text();
  if (!opml.trim()) return jsonError("Empty OPML payload");
  const result = await importSubscriptionsOpml(DEFAULT_USER_ID, opml);
  return jsonOk(result);
}
