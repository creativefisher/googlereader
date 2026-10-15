import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api/response";
import { ensureDefaultUser, getRefreshIntervalMinutes } from "@/lib/db/user";
import { updateRefreshInterval } from "@/lib/jobs/refresh-scheduler";

const schema = z.object({
  refreshIntervalMinutes: z.number().int().min(5).max(24 * 60),
});

export async function GET() {
  await ensureDefaultUser();
  return jsonOk({ refreshIntervalMinutes: await getRefreshIntervalMinutes() });
}

export async function PUT(request: Request) {
  await ensureDefaultUser();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return jsonError("Invalid request body");
  await updateRefreshInterval(parsed.data.refreshIntervalMinutes);
  return jsonOk({ ok: true });
}

export const dynamic = "force-dynamic";
