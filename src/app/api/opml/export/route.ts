import { DEFAULT_USER_ID } from "@/lib/constants";
import { ensureDefaultUser } from "@/lib/db/user";
import { exportSubscriptionsOpml } from "@/lib/opml/import-export";

export async function GET() {
  await ensureDefaultUser();
  const xml = await exportSubscriptionsOpml(DEFAULT_USER_ID);
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": 'attachment; filename="subscriptions.opml"',
    },
  });
}

export const dynamic = "force-dynamic";
