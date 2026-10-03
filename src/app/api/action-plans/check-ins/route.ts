import type { NextRequest } from "next/server";
import { ok, fail, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { roadmapFailure } from "@/lib/roadmap/http";
import { checkInRequestSchema } from "@/lib/check-ins/schema";
import { getCheckIns, saveCheckIn, generateCheckIn, patchCheckIn } from "@/lib/check-ins/service";
export const maxDuration = 180;
function response(data: unknown) { const res = ok(data); res.headers.set("Cache-Control", "private, no-store"); return res; }
export async function GET(req: NextRequest) {
  try { const session = await getUserSession(); if (!session) return unauthorized(); return response(await getCheckIns(session.uid, req.nextUrl.searchParams.get("planId"))); } catch (cause) { return roadmapFailure(cause); }
}
async function write(req: NextRequest) {
  try {
    if (!await getUserSession()) return unauthorized();
    const account = await requirePlan("pro"); if (!account) return fail("此功能需 Pro 以上有效方案 / Active Pro plan required", 403);
    const input = checkInRequestSchema.parse(await req.json());
    return response(input.action === "save" ? await saveCheckIn(account.id, input) : input.action === "generate" ? await generateCheckIn(account, input) : await patchCheckIn(account.id, input));
  } catch (cause) { return roadmapFailure(cause); }
}
export const POST = write;
export const PATCH = write;
