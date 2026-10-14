import type { ZodType } from "zod";

export type ParseJsonResult<T> =
  | { success: true; data: T }
  | { success: false; error: "invalid_json" | "invalid_body" };

export async function parseJsonBody<T>(request: Request, schema: ZodType<T>): Promise<ParseJsonResult<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { success: false, error: "invalid_json" };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "invalid_body" };
  }
  return { success: true, data: parsed.data };
}
