import type { NextRequest } from "next/server";
import { z } from "zod";
import { browserMutationGuard } from "@/lib/security/http";
import { checkRateLimit, clientIp, DAY_MS } from "@/lib/rate-limit";
import { fail, failFromError, ok } from "@/lib/api";
import { PlanWriteError } from "@/lib/action-plan/service";
import { confirmation } from "@/lib/action-plan/flow/service";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = browserMutationGuard(req); if (blocked) return blocked;
  try {
    const input = z.object({ token: z.string().max(100), answer: z.enum(["yes", "no"]) }).strict().parse(await req.json());
    const { id } = await params;
    if (!(await checkRateLimit("flow-confirm:" + clientIp(req) + ":" + id, 500, DAY_MS)).ok) return fail("回覆過於頻繁，請稍後再試 / Too many responses; retry later", 429);
    const result = ok(await confirmation(id, input.token, input.answer)); result.headers.set("Cache-Control", "private, no-store"); return result;
  } catch (error) {
    if (error instanceof PlanWriteError) return fail(error.message, error.status);
    if (error instanceof z.ZodError || error instanceof SyntaxError) return fail("回覆資料無效 / Invalid response", 400);
    return failFromError(error);
  }
}
