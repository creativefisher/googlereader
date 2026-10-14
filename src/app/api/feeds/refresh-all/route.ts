import { jsonOk } from "@/lib/api/response";
import { refreshAllFeeds } from "@/lib/jobs/refresh-scheduler";

export async function POST() {
  const result = await refreshAllFeeds();
  return jsonOk(result);
}
