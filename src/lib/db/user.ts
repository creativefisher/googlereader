import { Prisma } from "@prisma/client";

import { DEFAULT_USER_ID } from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";

export async function ensureDefaultUser() {
  try {
    return await prisma.user.upsert({
      where: { id: DEFAULT_USER_ID },
      create: {
        id: DEFAULT_USER_ID,
        email: "local@reader.app",
        settings: { create: {} },
      },
      update: {},
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.user.findUnique({ where: { id: DEFAULT_USER_ID } });
      if (existing) return existing;
    }
    throw error;
  }
}

export async function getRefreshIntervalMinutes(): Promise<number> {
  await ensureDefaultUser();
  const settings = await prisma.userSettings.findUnique({
    where: { userId: DEFAULT_USER_ID },
  });
  return settings?.refreshIntervalMinutes ?? 30;
}
