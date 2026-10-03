import { browserMutationGuard } from "@/lib/security/http";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAccount } from "@/lib/auth/account";
import { getEffectivePlan } from "@/lib/billing/gate";
import { failFromError, unauthorized } from "@/lib/api";
import { checkRateLimit, MINUTE_MS } from "@/lib/rate-limit";
import { calendarWeekStart, weekMutationSchema } from "@/lib/week-plan/schema";
import { CalendarError, getWeekPlan, mutateWeekPlan } from "@/lib/week-plan/service";
function response(data: unknown) { return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } }); }
function failure(error: unknown) {
  if (error instanceof CalendarError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("；"), code: "invalid_input" }, { status: 400 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "無效 JSON / Invalid JSON", code: "invalid_json" }, { status: 400 });
  return failFromError(error);
}
export async function GET(req: Request) {
  try {
    const account = await getCurrentAccount(); if (!account) return unauthorized();
    const week = new URL(req.url).searchParams.get("weekStart");
    return response(await getWeekPlan(account.id, getEffectivePlan(account) !== "free", week == null ? undefined : calendarWeekStart.parse(week)));
  } catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  const blocked = browserMutationGuard(req, true);
  if (blocked) return blocked;
  try {
    const account = await getCurrentAccount(); if (!account) return unauthorized();
    if (req.headers.get("origin") !== new URL(req.url).origin) throw new CalendarError("請從平台頁面提交 / Submit from the platform", 403, "invalid_origin");
    const input = weekMutationSchema.parse(await req.json());
    if (!(await checkRateLimit(`week-plan:${account.id}`, 40, MINUTE_MS, false)).ok) throw new CalendarError("操作過於頻繁，請稍後重試 / Too many requests; retry shortly", 429, "rate_limit");
    return response({ id: await mutateWeekPlan(account.id, getEffectivePlan(account) !== "free", input) });
  } catch (error) { return failure(error); }
}
