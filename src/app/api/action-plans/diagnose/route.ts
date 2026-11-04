import { browserMutationGuard } from "@/lib/security/http";
import { type NextRequest } from "next/server";
import { fail, failFromError, ok, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { getCurrentAccount } from "@/lib/auth/account";
import { DISCOVERY_POLICY, discoveryTrialActive } from "@/lib/discovery/policy";
import { prepareDiscoverySetup } from "@/lib/discovery/setup";
import { PlanWriteError } from "@/lib/action-plan/service";
import { DIAGNOSTIC_QUESTIONS } from "@/lib/action-plan/builder-draft";
import { checkRateLimit, DAY_MS } from "@/lib/rate-limit";
import { getLatestQuizResult } from "@/lib/quiz/result";
import { diagnoseActionPlan } from "@/lib/action-plan/ai";
import { prisma } from "@/lib/prisma";
import { readDiscoverySetup } from "@/lib/discovery/policy";
import { personalizationSchema } from "@/lib/action-plan/personalization";
import { diagnoseBodySchema } from "@/lib/action-plan/schemas";

export const maxDuration = 120;
// 一次診斷最多四次請求（起始 + 三題），保留約十次完整診斷的額度。
const DAILY_LIMIT = 40;

export async function POST(req: NextRequest) {
  const blocked = browserMutationGuard(req, true);
  if (blocked) return blocked;
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    const account = await requirePlan("pro");
    const trial = account ? null : await getCurrentAccount();
    if (!account && (trial?.trialPolicy !== DISCOVERY_POLICY || !discoveryTrialActive(trial))) return fail("此功能需有效方案或訪談試用 / An active plan or interview trial is required", 403);
    const parsed = diagnoseBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(parsed.error.issues.map((issue) => `${issue.path.join(".") || "欄位"}：${issue.message}`).join("；"), 400);
    }
    const rate = await checkRateLimit(`action-plan:diagnose:${session.uid}`, DAILY_LIMIT, DAY_MS);
    if (!rate.ok) return fail(`已達本日 Action Plan 診斷請求上限（每日 ${DAILY_LIMIT} 次請求）。`, 429);
    if (!account && trial) {
      if (!parsed.data.personalization && parsed.data.answers.length < 3) return ok({ status: "needs_input", question: DIAGNOSTIC_QUESTIONS[parsed.data.locale][parsed.data.answers.length] });
      if (!parsed.data.requestId) return fail("缺少請求識別碼 / Request ID required", 400);
      return ok(await prepareDiscoverySetup(trial, { ...parsed.data, requestId: parsed.data.requestId }));
    }
    const quiz = await getLatestQuizResult(session.uid);
    return ok(await diagnoseActionPlan({ ...parsed.data, profile: account!.profile, quiz }));
  } catch (error) {
    if (error instanceof PlanWriteError) return fail(error.message, error.status);
    if (error instanceof Error && /timeout|timed out/i.test(error.name + error.message)) {
      return fail("AI 診斷逾時，回答仍保留，請重試。 / AI diagnosis timed out. Your answers are preserved; retry.", 504);
    }
    if (error instanceof Error && error.message.startsWith("NOVA 診斷驗證失敗")) {
      return fail(error.message, 422);
    }
    return failFromError(error);
  }
}

// Read saved answers without generating AI or changing the current plan.
export async function GET() {
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    const [plans, journey] = await Promise.all([
      prisma.actionPlan.findMany({ where: { userId: session.uid }, orderBy: { createdAt: "desc" }, select: { diagnosticAnswers: true, personalization: true } }),
      prisma.discoveryJourney.findUnique({ where: { userId: session.uid }, select: { setup: true } }),
    ]);
    const setup = readDiscoverySetup(journey?.setup);
    const openingAnswers = plans.map(plan => diagnoseBodySchema.shape.answers.unwrap().length(3).safeParse(plan.diagnosticAnswers).data).find(Boolean) || (setup?.answers.length === 3 ? setup.answers : []);
    const response = ok({ openingAnswers, personalization: personalizationSchema.safeParse(plans[0]?.personalization).data || setup?.personalization || null });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return failFromError(error); }
}
