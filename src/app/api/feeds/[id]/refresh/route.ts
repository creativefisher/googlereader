import { jsonOk } from "@/lib/api/response";
import { refreshFeedById } from "@/lib/feeds/ingestion";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const result = await refreshFeedById(params.id);
  return jsonOk(result);
}

export const dynamic = "force-dynamic";
