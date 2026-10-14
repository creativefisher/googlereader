import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api/response";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { ensureDefaultUser } from "@/lib/db/user";
import { createFolder } from "@/lib/folders/management";

const schema = z.object({ name: z.string().min(1) });

export async function POST(request: Request) {
  await ensureDefaultUser();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return jsonError("Invalid request body");
  try {
    const folder = await createFolder(DEFAULT_USER_ID, parsed.data.name);
    return jsonOk(folder, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Failed to create folder");
  }
}
