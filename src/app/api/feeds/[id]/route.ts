import { jsonError, jsonOk } from "@/lib/api/response";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { ensureDefaultUser } from "@/lib/db/user";
import { prisma } from "@/lib/db/prisma";

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  await ensureDefaultUser();
  const subscription = await prisma.subscription.findFirst({
    where: { userId: DEFAULT_USER_ID, feedId: params.id },
  });
  if (!subscription) return jsonError("Subscription not found", 404);
  await prisma.subscription.delete({ where: { id: subscription.id } });
  const remaining = await prisma.subscription.count({ where: { feedId: params.id } });
  if (remaining === 0) {
    await prisma.feed.delete({ where: { id: params.id } });
  }
  return jsonOk({ ok: true });
}
