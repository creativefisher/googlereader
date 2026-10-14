import { DEFAULT_USER_ID } from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";

export async function ensureDefaultUser() {
  const existing = await prisma.user.findUnique({ where: { id: DEFAULT_USER_ID } });
  if (existing) return existing;

  return prisma.user.create({
    data: {
      id: DEFAULT_USER_ID,
      email: "local@reader.app",
      settings: {
        create: {},
      },
    },
  });
}

export async function getRefreshIntervalMinutes(): Promise<number> {
  await ensureDefaultUser();
  const settings = await prisma.userSettings.findUnique({
    where: { userId: DEFAULT_USER_ID },
  });
  return settings?.refreshIntervalMinutes ?? 30;
}
