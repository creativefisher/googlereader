import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api/response";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { deleteFolder, renameFolder } from "@/lib/folders/management";

const patchSchema = z.object({ name: z.string().min(1) });

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError("Invalid request body");
  try {
    const folder = await renameFolder(DEFAULT_USER_ID, params.id, parsed.data.name);
    return jsonOk(folder);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Failed to rename folder");
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await deleteFolder(DEFAULT_USER_ID, params.id);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Failed to delete folder");
  }
}
