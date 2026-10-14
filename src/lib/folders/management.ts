import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export class FolderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FolderError";
  }
}

function handleFolderWriteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new FolderError("A folder with this name already exists");
  }
  throw error;
}

export async function createFolder(userId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new FolderError("Folder name is required");
  const maxOrder = await prisma.folder.aggregate({
    where: { userId },
    _max: { sortOrder: true },
  });
  try {
    return await prisma.folder.create({
      data: {
        userId,
        name: trimmed,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });
  } catch (error) {
    handleFolderWriteError(error);
  }
}

export async function renameFolder(userId: string, folderId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new FolderError("Folder name is required");
  const folder = await prisma.folder.findFirst({ where: { id: folderId, userId } });
  if (!folder) throw new FolderError("Folder not found");
  try {
    return await prisma.folder.update({
      where: { id: folderId },
      data: { name: trimmed },
    });
  } catch (error) {
    handleFolderWriteError(error);
  }
}

export async function deleteFolder(userId: string, folderId: string) {
  const folder = await prisma.folder.findFirst({ where: { id: folderId, userId } });
  if (!folder) throw new FolderError("Folder not found");
  await prisma.$transaction([
    prisma.subscription.updateMany({
      where: { userId, folderId },
      data: { folderId: null },
    }),
    prisma.folder.delete({ where: { id: folderId } }),
  ]);
}

export async function listFoldersWithSubscriptions(userId: string) {
  return prisma.folder.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
    include: {
      subscriptions: {
        orderBy: { sortOrder: "asc" },
        include: { feed: true },
      },
    },
  });
}
