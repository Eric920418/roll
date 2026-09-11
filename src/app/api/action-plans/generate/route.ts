import { type NextRequest } from "next/server";
import { fail, failFromError, ok, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { checkRateLimit, DAY_MS } from "@/lib/rate-limit";
import { getLatestQuizResult } from "@/lib/quiz/result";
import { generateActionCandidates } from "@/lib/action-plan/ai";
import { generateBodySchema } from "@/lib/action-plan/schemas";
import { getPlanByRequestId, persistGeneratedPlan } from "@/lib/action-plan/service";

export const maxDuration = 300;
const DAILY_LIMIT = 3;

export async function POST(req: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    const account = await requirePlan("pro");
    if (!account) return fail("此功能需 Pro 以上方案", 403);
    const parsed = generateBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(parsed.error.issues.map((issue) => `${issue.path.join(".") || "欄位"}：${issue.message}`).join("；"), 400);
    }

    const existing = await getPlanByRequestId(session.uid, parsed.data.requestId);
    if (existing) return ok(existing);
    const rate = await checkRateLimit(`action-plan:generate:${session.uid}`, DAILY_LIMIT, DAY_MS);
    if (!rate.ok) return fail(`已達本日 Action Plan 生成上限（每日 ${DAILY_LIMIT} 次）。`, 429);

    const quiz = await getLatestQuizResult(session.uid);
    const actions = await generateActionCandidates({
      locale: parsed.data.locale,
      profile: account.profile,
      quiz,
      messages: parsed.data.messages,
      diagnosis: parsed.data.diagnosis,
      candidateCount: parsed.data.candidateCount,
    });
    const plan = await persistGeneratedPlan({
      userId: session.uid,
      locale: parsed.data.locale,
      requestId: parsed.data.requestId,
      diagnosis: parsed.data.diagnosis,
      actions,
    });
    return ok(plan, 201);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("NOVA Action Plan 驗證失敗")) {
      return fail(error.message, 422);
    }
    return failFromError(error);
  }
}
