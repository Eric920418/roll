import { type NextRequest } from "next/server";
import { fail, failFromError, ok, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { checkRateLimit, DAY_MS } from "@/lib/rate-limit";
import { getLatestQuizResult } from "@/lib/quiz/result";
import { diagnoseActionPlan } from "@/lib/action-plan/ai";
import { diagnoseBodySchema } from "@/lib/action-plan/schemas";

export const maxDuration = 60;
const DAILY_LIMIT = 10;

export async function POST(req: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    const account = await requirePlan("pro");
    if (!account) return fail("此功能需 Pro 以上方案", 403);
    const parsed = diagnoseBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(parsed.error.issues.map((issue) => `${issue.path.join(".") || "欄位"}：${issue.message}`).join("；"), 400);
    }
    const rate = await checkRateLimit(`action-plan:diagnose:${session.uid}`, DAILY_LIMIT, DAY_MS);
    if (!rate.ok) return fail(`已達本日 Action Plan 診斷上限（每日 ${DAILY_LIMIT} 次）。`, 429);
    const quiz = await getLatestQuizResult(session.uid);
    return ok(await diagnoseActionPlan({ ...parsed.data, profile: account.profile, quiz }));
  } catch (error) {
    return failFromError(error);
  }
}
