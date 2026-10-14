import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_USER_ID } from "@/lib/constants";
import { prisma } from "@/lib/db/prisma";
import { createFolder, deleteFolder, renameFolder } from "@/lib/folders/management";

afterEach(async () => {
  await prisma.subscription.deleteMany();
  await prisma.folder.deleteMany();
  await prisma.user.deleteMany({ where: { id: DEFAULT_USER_ID } });
});

describe("folder management", () => {
  it("creates, renames, and deletes folders", async () => {
    await prisma.user.upsert({
      where: { id: DEFAULT_USER_ID },
      create: { id: DEFAULT_USER_ID, settings: { create: {} } },
      update: {},
    });
    const folder = await createFolder(DEFAULT_USER_ID, "Reading List");
    expect(folder.name).toBe("Reading List");
    const renamed = await renameFolder(DEFAULT_USER_ID, folder.id, "Must Read");
    expect(renamed.name).toBe("Must Read");
    await deleteFolder(DEFAULT_USER_ID, folder.id);
    const remaining = await prisma.folder.count({ where: { userId: DEFAULT_USER_ID } });
    expect(remaining).toBe(0);
  });
});
