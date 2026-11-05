import type { NextRequest } from "next/server";
import { z } from "zod";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { browserMutationGuard } from "@/lib/security/http";
import { fail, failFromError, ok, unauthorized } from "@/lib/api";
import { PlanWriteError } from "@/lib/action-plan/service";
import { getFlow, mutateFlow, flowMutationSchema } from "@/lib/action-plan/flow/service";
import { checkRateLimit, DAY_MS } from "@/lib/rate-limit";

function response(data: unknown) { const result = ok(data); result.headers.set("Cache-Control", "private, no-store"); return result; }
function failure(error: unknown) {
  if (error instanceof PlanWriteError) return fail(error.message, error.status);
  if (error instanceof z.ZodError) return fail(error.issues.map(i => i.path.join(".") + ": " + i.message).join("; "), 400);
  if (error instanceof SyntaxError) return fail("無效 JSON / Invalid JSON", 400);
  return failFromError(error);
}
export async function GET(req: NextRequest) {
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    if (!await requirePlan("pro")) return fail("此功能需有效方案 / An active plan is required", 403);
    return response(await getFlow(session.uid, req.nextUrl.searchParams.get("planId") || undefined, req.nextUrl.searchParams.get("locale") === "zh-tw" ? "zh-tw" : "en"));
  } catch (error) { return failure(error); }
}
export async function POST(req: NextRequest) {
  const blocked = browserMutationGuard(req, true); if (blocked) return blocked;
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    if (!await requirePlan("pro")) return fail("此功能需有效方案 / An active plan is required", 403);
    const text = await req.text(); if (text.length > 2_000_000) return fail("內容過大，請縮短紀錄 / Records are too large", 413);
    const input = flowMutationSchema.parse(JSON.parse(text));
    if (input.action === "confirmLink" && !(await checkRateLimit("flow-confirm-link:" + session.uid, 100, DAY_MS)).ok) return fail("今日確認連結已達 100 次，請明天再試 / Daily confirmation link limit reached", 429);
    return response(await mutateFlow(session.uid, input, req.nextUrl.searchParams.get("locale") === "zh-tw" ? "zh-tw" : "en"));
  } catch (error) { return failure(error); }
}
