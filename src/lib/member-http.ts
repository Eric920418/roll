import "server-only";
import { z } from "zod";
import { getUserSession } from "@/lib/auth/guard";
import { checkRateLimit, MINUTE_MS } from "@/lib/rate-limit";
import { fail, failFromError, ok, rateLimited, unauthorized } from "@/lib/api";

export class MemberError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export const changed = () => new MemberError("內容已更新，請載入最新版並比對後再確認；輸入保留 / Content changed. Load the latest version, compare and confirm again; input retained");
export function memberError(error: unknown) {
  if (error instanceof MemberError) return fail(error.message, error.status);
  if (error instanceof z.ZodError) return fail(error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "), 400);
  if (error instanceof SyntaxError) return fail("無效 JSON / Invalid JSON", 400);
  return failFromError(error);
}
export function privateOk<T>(data: T, status = 200) {
  const response = ok(data, status);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export async function memberAccess(write = false): Promise<string | Response> {
  const session = await getUserSession();
  if (!session) return unauthorized();
  const rate = await checkRateLimit(`member-${write ? "write" : "read"}:${session.uid}`, write ? 40 : 180, MINUTE_MS);
  return rate.ok ? session.uid : rateLimited(rate.retryAfterMs);
}
